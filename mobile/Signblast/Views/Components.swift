import AVFoundation
import SwiftUI
import UIKit

enum Feedback {
    static var enabled: Bool { UserDefaults.standard.object(forKey: "haptics") as? Bool ?? true }
    static func good() { if enabled { UINotificationFeedbackGenerator().notificationOccurred(.success) } }
    static func bad() { if enabled { UINotificationFeedbackGenerator().notificationOccurred(.error) } }
    static func tap() { if enabled { UIImpactFeedbackGenerator(style: .light).impactOccurred() } }
}

struct Flash: Equatable {
    let id = UUID()
    let text: String
    let good: Bool
}

/// Shared bits for every game model: the sign entry point, stop, and a short feedback message.
class GameModel: ObservableObject {
    @Published var flash: Flash?
    var store: ProgressStore!

    func sign(_ letter: String) {}
    func stop() {}

    func say(_ text: String, good: Bool, haptic: Bool = true) {
        let f = Flash(text: text, good: good)
        flash = f
        if haptic { good ? Feedback.good() : Feedback.bad() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { [weak self] in
            if self?.flash?.id == f.id { self?.flash = nil }
        }
    }
}

/// Wraps a game: camera preview on top (or the tap pad at the bottom), and wires signs into the model.
struct GameScreen<Content: View>: View {
    @EnvironmentObject private var hub: SignHub
    let model: GameModel
    var showInput: Bool
    @ViewBuilder var content: Content
    @State private var token: UUID?

    var body: some View {
        VStack(spacing: 12) {
            if showInput && !hub.usesPad {
                CameraPanel(camera: hub.camera).frame(maxHeight: 210)
            }
            content
            Spacer(minLength: 0)
            if showInput && hub.usesPad {
                LetterPad { hub.emit($0) }
            }
        }
        .padding()
        .onAppear { token = hub.attach { [weak model] letter in model?.sign(letter) } }
        .onDisappear {
            hub.detach(token)
            model.stop()
        }
    }
}

struct FlashBanner: View {
    let flash: Flash?
    var body: some View {
        Text(flash?.text ?? " ")
            .font(.headline)
            .foregroundStyle(flash?.good == true ? Color.green : Color.red)
            .frame(height: 24)
            .animation(.default, value: flash)
    }
}

struct StatChip: View {
    let label: String
    let value: String
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.monospacedDigit().bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct ReadyCard: View {
    let game: GameKind
    let rules: [String]
    let best: Int
    var extra: AnyView? = nil
    let start: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: game.symbol).font(.system(size: 44))
            Text(game.title).font(.title.bold())
            VStack(alignment: .leading, spacing: 8) {
                ForEach(rules, id: \.self) { Label($0, systemImage: "checkmark.circle") }
            }
            .font(.subheadline)
            if let extra { extra }
            Text("Best: \(best)").foregroundStyle(.secondary)
            Button("Start", action: start)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding(.top, 8)
    }
}

struct ResultsView: View {
    @EnvironmentObject private var store: ProgressStore
    let game: GameKind
    let score: Int
    let isBest: Bool
    let lines: [String]
    let practise: [String]
    let again: () -> Void

    var body: some View {
        List {
            Section {
                VStack(spacing: 6) {
                    Text(game.title).font(.headline)
                    Text("\(score)").font(.system(size: 56, weight: .bold).monospacedDigit())
                    Text(isBest ? "New best!" : "Best: \(store.best(game))")
                        .foregroundStyle(isBest ? .green : .secondary)
                }
                .frame(maxWidth: .infinity)
            }
            Section("This round") {
                ForEach(lines, id: \.self) { Text($0) }
            }
            if !practise.isEmpty {
                Section("Practise next") {
                    ForEach(practise, id: \.self) { letter in
                        NavigationLink("Letter \(letter): \(Signs.hints[letter] ?? "")") { LetterCheckView(letter: letter) }
                    }
                }
            }
            Section {
                Button("Play again", action: again)
            }
        }
        .listStyle(.insetGrouped)
    }
}

/// Simulator / no-camera input: tap a letter to "sign" it.
struct LetterPad: View {
    var onTap: (String) -> Void
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tap pad: tap a letter to sign it").font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(Signs.all, id: \.self) { letter in
                    Button {
                        Feedback.tap()
                        onTap(letter)
                    } label: {
                        Text(letter)
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("pad-\(letter)")
                }
            }
        }
    }
}

// MARK: camera

struct CameraPanel: View {
    @ObservedObject var camera: SignCamera

    var body: some View {
        ZStack {
            Color.black
            switch camera.state {
            case .on:
                CameraPreview(session: camera.session)
                LandmarkOverlay(points: camera.frame.points, recognised: camera.frame.letter != nil)
            case .starting, .off:
                ProgressView("Starting camera…").tint(.white).foregroundStyle(.white)
            case .denied:
                Text("Camera blocked. Allow it in iOS Settings > Signblast.").foregroundStyle(.white).padding()
            case .unavailable:
                Text("No camera").foregroundStyle(.white)
            }
        }
        .aspectRatio(3 / 4, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(alignment: .topTrailing) {
            Text(camera.frame.letter ?? (camera.frame.hasHand ? "?" : "–"))
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.white)
                .padding(8)
                .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
                .padding(6)
        }
        .overlay(alignment: .bottom) {
            GeometryReader { g in
                Rectangle().fill(.green).frame(width: g.size.width * camera.frame.hold, height: 5)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct LandmarkOverlay: View {
    let points: [CGPoint]
    let recognised: Bool
    var body: some View {
        Canvas { ctx, size in
            for p in points {
                let r = CGRect(x: p.x * size.width - 4, y: p.y * size.height - 4, width: 8, height: 8)
                ctx.fill(Path(ellipseIn: r), with: .color(recognised ? .green : .white))
            }
        }
    }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        override func layoutSubviews() {
            super.layoutSubviews()
            if let c = previewLayer.connection, c.isVideoRotationAngleSupported(90), c.videoRotationAngle != 90 {
                c.videoRotationAngle = 90
            }
        }
    }
}
