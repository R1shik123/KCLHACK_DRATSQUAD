import SwiftUI

/// Echo: letters flash one at a time, then you sign the sequence back from memory.
/// Every success adds a letter. One mistake ends the game. One "peek" (replay) per game.
final class EchoModel: GameModel {
    enum Phase { case ready, showing, input, done }

    @Published var phase: Phase = .ready
    @Published var sequence: [String] = []
    @Published var shown: String?          // letter on screen while showing
    @Published var entered = 0             // how many of the sequence you've signed back
    @Published var best = 0                // longest sequence completed this game
    @Published var peeks = 1
    @Published var failedOn: String?
    @Published var lastWrong: String?
    @Published var isBest = false

    private var gen = 0                    // cancels scheduled steps when the game restarts or stops
    private var promptAt = Date()
    private var hits = 0

    func start(_ store: ProgressStore) {
        self.store = store
        sequence = []; best = 0; peeks = 1; failedOn = nil; lastWrong = nil; isBest = false; hits = 0
        grow()
    }

    private func grow() {
        sequence.append(store.pick(from: Signs.solid, avoiding: sequence.last))
        if sequence.count == 1 { sequence.append(store.pick(from: Signs.solid, avoiding: sequence.last)) } // start at 2
        play()
    }

    private func play() {
        gen += 1
        let g = gen
        phase = .showing
        entered = 0
        shown = nil
        let on = 0.9, gap = 0.3, lead = 0.5
        for (i, letter) in sequence.enumerated() {
            let t = lead + Double(i) * (on + gap)
            DispatchQueue.main.asyncAfter(deadline: .now() + t) { [weak self] in
                guard let self, self.gen == g else { return }
                self.shown = letter
                Feedback.tap()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + t + on) { [weak self] in
                guard let self, self.gen == g else { return }
                self.shown = nil
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + lead + Double(sequence.count) * (on + gap)) { [weak self] in
            guard let self, self.gen == g else { return }
            self.phase = .input
            self.promptAt = Date()
        }
    }

    func peek() {
        guard phase == .input, peeks > 0 else { return }
        peeks -= 1
        play()
    }

    override func sign(_ letter: String) {
        guard phase == .input else { return }
        let want = sequence[entered]
        if letter == want {
            store.hit(letter, ms: Date().timeIntervalSince(promptAt) * 1000)
            hits += 1
            promptAt = Date()
            entered += 1
            if entered == sequence.count {
                best = sequence.count
                say("Perfect! \(best) in a row", good: true)
                gen += 1
                let g = gen
                phase = .showing   // lock input until the next sequence starts
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                    guard let self, self.gen == g else { return }
                    self.grow()
                }
            } else {
                Feedback.tap()
            }
        } else {
            store.miss(want)
            failedOn = want
            lastWrong = letter
            gen += 1
            phase = .done
            Feedback.bad()
            isBest = store.finish(.echo, score: best, accuracy: Double(hits) / Double(hits + 1))
        }
    }

    override func stop() {
        gen += 1
        if phase != .done { phase = .ready }
    }
}

struct EchoView: View {
    @EnvironmentObject private var store: ProgressStore
    @StateObject private var m = EchoModel()

    var body: some View {
        GameScreen(model: m, showInput: m.phase == .showing || m.phase == .input) {
            switch m.phase {
            case .ready:
                ReadyCard(game: .echo,
                          rules: ["Watch the letters flash", "Sign them back in the same order", "Each round adds one letter", "One mistake ends it; one peek per game"],
                          best: store.best(.echo)) { m.start(store) }
            case .showing, .input:
                VStack(spacing: 12) {
                    HStack {
                        StatChip(label: "Length", value: "\(m.sequence.count)")
                        StatChip(label: "Best", value: "\(m.best)")
                        StatChip(label: "Peeks", value: "\(m.peeks)")
                    }
                    if m.phase == .showing {
                        Text(m.shown ?? "•")
                            .font(.system(size: 110, weight: .bold, design: .rounded))
                            .foregroundStyle(m.shown == nil ? Color.secondary : Color.primary)
                        Text("Watch…").foregroundStyle(.secondary)
                    } else {
                        HStack(spacing: 8) {
                            ForEach(0..<m.sequence.count, id: \.self) { i in
                                Text(i < m.entered ? m.sequence[i] : "?")
                                    .font(.title.bold())
                                    .frame(width: 40, height: 50)
                                    .background(i == m.entered ? Color.accentColor.opacity(0.2) : Color(.secondarySystemBackground),
                                                in: RoundedRectangle(cornerRadius: 8))
                            }
                        }
                        .accessibilityIdentifier("echo-slots")
                        Text("Your turn: sign letter \(m.entered + 1) of \(m.sequence.count)").foregroundStyle(.secondary)
                        Button("Peek (\(m.peeks) left)") { m.peek() }
                            .buttonStyle(.bordered)
                            .disabled(m.peeks == 0)
                    }
                    FlashBanner(flash: m.flash)
                }
            case .done:
                ResultsView(game: .echo, score: m.best, isBest: m.isBest,
                            lines: ["Longest sequence: \(m.best)",
                                    "The sequence was: \(m.sequence.joined(separator: " "))",
                                    "Ended on: you signed \(m.lastWrong ?? "–"), it was \(m.failedOn ?? "–")"],
                            practise: m.failedOn.map { [$0] } ?? []) { m.start(store) }
            }
        }
        .navigationTitle(GameKind.echo.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
