import AVFoundation
import Vision
import UIKit

/// Front camera + Apple Vision hand pose + the hold-to-fire filter.
/// All capture work happens on one serial queue; published values are set on the main thread.
final class SignCamera: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum State: Equatable { case off, starting, on, denied, unavailable }

    struct Frame {
        var letter: String?
        var guess: String?
        var confidence: Double = 0
        var hold: Double = 0            // 0…1, fills while the same letter is held
        var points: [CGPoint] = []      // normalised 0…1, y down, mirrored like the preview
        var hasHand = false
    }

    @Published private(set) var state: State = .off
    @Published private(set) var frame = Frame()
    /// Called on the main thread when a letter has been held long enough.
    var onSign: ((String) -> Void)?
    /// Frames the same letter must be seen in a row before it fires.
    var stableFrames = 8
    let rearmFrames = 14                // holding the sign fires again after this many more frames

    let session = AVCaptureSession()
    static let hasCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) != nil

    private let queue = DispatchQueue(label: "signblast.camera")
    private let request: VNDetectHumanHandPoseRequest = {
        let r = VNDetectHumanHandPoseRequest()
        r.maximumHandCount = 2
        return r
    }()
    private var configured = false
    private var wantOn = false          // main thread
    private var run = 0                 // camera queue
    private var lastLetter: String?     // camera queue

    private static let joints: [VNHumanHandPoseObservation.JointName] = [
        .wrist,
        .thumbCMC, .thumbMP, .thumbIP, .thumbTip,
        .indexMCP, .indexPIP, .indexDIP, .indexTip,
        .middleMCP, .middlePIP, .middleDIP, .middleTip,
        .ringMCP, .ringPIP, .ringDIP, .ringTip,
        .littleMCP, .littlePIP, .littleDIP, .littleTip,
    ]

    func start() {
        guard Self.hasCamera else { state = .unavailable; return }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            setRunning(true)
        case .notDetermined:
            state = .starting
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async { if ok { self.setRunning(true) } else { self.state = .denied } }
            }
        default:
            state = .denied
        }
    }

    func stop() { setRunning(false) }

    private func setRunning(_ on: Bool) {
        wantOn = on
        if on {
            if state == .on { return }
            state = .starting
        } else {
            if state == .on || state == .starting { state = .off }
            frame = Frame()
        }
        queue.async {
            if on {
                guard self.configured || self.configure() else {
                    DispatchQueue.main.async { self.state = .unavailable }
                    return
                }
                if !self.session.isRunning { self.session.startRunning() }
                DispatchQueue.main.async { if self.wantOn { self.state = .on } }
            } else if self.session.isRunning {
                self.session.stopRunning()
            }
            self.run = 0
            self.lastLetter = nil
        }
    }

    /// camera queue
    private func configure() -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .vga640x480
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return false }
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { return false }
        session.addOutput(output)
        if let c = output.connection(with: .video) {
            // Portrait, mirrored buffers: Vision's coordinates then match what the preview shows.
            if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
            if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = true }
        }
        configured = true
        return true
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let w = Double(CVPixelBufferGetWidth(pixels)), h = Double(CVPixelBufferGetHeight(pixels))
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up)
        try? handler.perform([request])

        var best: Classification?
        var bestPoints: [CGPoint] = []
        for hand in request.results ?? [] {
            guard let found = try? hand.recognizedPoints(.all) else { continue }
            var lm: [HandPoint] = []
            var pts: [CGPoint] = []
            for joint in Self.joints {
                guard let p = found[joint], p.confidence > 0.2 else { break }
                // Vision is normalised with y up. Convert to y-down pixels, then scale x and y like the
                // web version's 4:3 landscape frame (x / 640, y / 480) so its tuned thresholds still fit.
                lm.append(HandPoint(x: p.location.x * w / 4, y: (1 - p.location.y) * h / 3))
                pts.append(CGPoint(x: p.location.x, y: 1 - p.location.y))
            }
            guard lm.count == 21 else { continue }
            let c = HandClassifier.classify(lm)
            if HandClassifier.better(c, than: best) { best = c; bestPoints = pts }
        }

        let letter = best?.letter
        if let letter, letter == lastLetter { run += 1 } else { run = letter == nil ? 0 : 1; lastLetter = letter }
        let need = stableFrames
        let fire = letter != nil && (run == need || (run > need && (run - need) % rearmFrames == 0))
        let f = Frame(letter: letter, guess: best?.guess, confidence: best?.confidence ?? 0,
                      hold: min(1, Double(run) / Double(need)), points: bestPoints, hasHand: best != nil)
        DispatchQueue.main.async {
            guard self.wantOn else { return }
            self.frame = f
            if fire, let letter { self.onSign?(letter) }
        }
    }
}
