import Combine
import Foundation

/// One place every screen gets signs from: the camera, or the tap pad when there is no camera
/// (the simulator, a denied permission, or the user's choice in Settings).
final class SignHub: ObservableObject {
    enum Mode: String, CaseIterable, Identifiable {
        case auto, camera, pad
        var id: String { rawValue }
        var label: String {
            switch self {
            case .auto: return "Camera if available"
            case .camera: return "Camera"
            case .pad: return "Tap pad"
            }
        }
    }

    @Published var mode: Mode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: "inputMode"); refresh() }
    }
    @Published var holdFrames: Int {
        didSet { UserDefaults.standard.set(holdFrames, forKey: "holdFrames"); camera.stableFrames = holdFrames }
    }

    let camera = SignCamera()
    private var handler: ((String) -> Void)?
    private var token: UUID?
    private var bag: AnyCancellable?

    init() {
        mode = Mode(rawValue: UserDefaults.standard.string(forKey: "inputMode") ?? "") ?? .auto
        let saved = UserDefaults.standard.integer(forKey: "holdFrames")
        holdFrames = saved > 0 ? saved : 8
        camera.stableFrames = holdFrames
        camera.onSign = { [weak self] letter in self?.handler?(letter) }
        // Re-render screens when the camera turns on/off or is blocked (not on every frame).
        bag = camera.$state.removeDuplicates().sink { [weak self] _ in self?.objectWillChange.send() }
    }

    var cameraWanted: Bool { mode != .pad && SignCamera.hasCamera }
    var usesPad: Bool { !cameraWanted || camera.state == .denied || camera.state == .unavailable }

    var statusText: String {
        if mode == .pad { return "Tap pad: tap a letter to sign it." }
        if !SignCamera.hasCamera { return "No camera on this device (e.g. the simulator), so the tap pad is used." }
        switch camera.state {
        case .denied: return "Camera blocked. Allow it in iOS Settings > Signblast. Using the tap pad meanwhile."
        case .unavailable: return "Camera unavailable. Using the tap pad."
        default: return "Camera: hold a sign steady to send it."
        }
    }

    /// The current screen takes the sign stream. The token stops an old screen from detaching a new one.
    @discardableResult
    func attach(_ h: @escaping (String) -> Void) -> UUID {
        let t = UUID()
        token = t
        handler = h
        refresh()
        return t
    }

    func detach(_ t: UUID?) {
        guard let t, t == token else { return }
        token = nil
        handler = nil
        refresh()
    }

    /// Tap pad input (and anything else that isn't the camera).
    func emit(_ letter: String) { handler?(letter) }

    private func refresh() {
        if handler != nil && cameraWanted { camera.start() } else { camera.stop() }
    }
}
