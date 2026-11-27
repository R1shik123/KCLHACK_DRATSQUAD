import SwiftUI

/// Sign Sprint: 60 seconds, one letter at a time, as fast as you can. Combo multiplier, Leitner-weighted
/// letters, a hint that appears for weak letters, and an 8-second limit per letter (then it counts as a miss).
final class SprintModel: GameModel {
    enum Phase { case ready, playing, done }

    @Published var phase: Phase = .ready
    @Published var allLetters = false
    @Published var target = "A"
    @Published var score = 0
    @Published var combo = 0
    @Published var bestCombo = 0
    @Published var hits = 0
    @Published var misses = 0
    @Published var timeLeft = 60.0
    @Published var showHint = false
    @Published var isBest = false

    let duration = 60.0
    let perLetter = 8.0
    private(set) var missed: [String: Int] = [:]
    private var reactions: [Double] = []
    private var shownAt = Date()
    private var endAt = Date()
    private var timer: Timer?

    var pool: [String] { allLetters ? Signs.all : Signs.solid }
    var multiplier: Int { min(5, 1 + combo / 3) }
    var accuracy: Double? { hits + misses > 0 ? Double(hits) / Double(hits + misses) : nil }
    var avgReactionMs: Double? { reactions.isEmpty ? nil : reactions.reduce(0, +) / Double(reactions.count) }
    var practise: [String] { missed.sorted { $0.value > $1.value }.prefix(3).map(\.key) }

    func start(_ store: ProgressStore) {
        self.store = store
        score = 0; combo = 0; bestCombo = 0; hits = 0; misses = 0
        missed = [:]; reactions = []; isBest = false
        endAt = Date().addingTimeInterval(duration)
        timeLeft = duration
        phase = .playing
        next()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
    }

    private func tick() {
        guard phase == .playing else { return }
        timeLeft = max(0, endAt.timeIntervalSinceNow)
        if timeLeft <= 0 { finish(); return }
        let age = Date().timeIntervalSince(shownAt)
        let hint = age > 3 && store.box(target) <= 2   // scaffolding only for letters you don't know yet
        if hint != showHint { showHint = hint }
        if age > perLetter { miss() }
    }

    override func sign(_ letter: String) {
        guard phase == .playing else { return }
        guard letter == target else {
            combo = 0
            say("That looks like \(letter)", good: false)
            return
        }
        let ms = Date().timeIntervalSince(shownAt) * 1000
        reactions.append(ms)
        hits += 1
        combo += 1
        bestCombo = max(bestCombo, combo)
        score += 100 * multiplier
        store.hit(target, ms: ms)
        say("Nice! \(target)", good: true)
        next()
    }

    func skip() {
        guard phase == .playing else { return }
        miss()
    }

    private func miss() {
        misses += 1
        combo = 0
        missed[target, default: 0] += 1
        store.miss(target)
        say("Missed \(target)", good: false)
        next()
    }

    private func next() {
        target = store.pick(from: pool, avoiding: target)
        shownAt = Date()
        showHint = false
    }

    private func finish() {
        timer?.invalidate()
        phase = .done
        isBest = store.finish(.sprint, score: score, accuracy: accuracy)
    }

    override func stop() {
        timer?.invalidate()
        timer = nil
        if phase == .playing { phase = .ready }   // leaving mid-round abandons it
    }
}

struct SprintView: View {
    @EnvironmentObject private var store: ProgressStore
    @StateObject private var m = SprintModel()

    var body: some View {
        GameScreen(model: m, showInput: m.phase == .playing) {
            switch m.phase {
            case .ready:
                ReadyCard(game: .sprint,
                          rules: ["60 seconds on the clock", "Sign the letter shown", "Every 3 in a row raises the multiplier (up to x5)", "8 seconds per letter, then it counts as missed"],
                          best: store.best(.sprint),
                          extra: AnyView(Toggle("All 26 letters (harder)", isOn: $m.allLetters).padding(.horizontal, 40))) {
                    m.start(store)
                }
            case .playing:
                VStack(spacing: 10) {
                    HStack {
                        StatChip(label: "Time", value: "\(Int(m.timeLeft.rounded(.up)))")
                        StatChip(label: "Score", value: "\(m.score)")
                        StatChip(label: "Combo", value: "x\(m.multiplier)")
                    }
                    Text(m.target)
                        .font(.system(size: 110, weight: .bold, design: .rounded))
                        .accessibilityIdentifier("sprint-target")
                    Text(m.showHint ? (Signs.hints[m.target] ?? "") : " ")
                        .font(.subheadline).foregroundStyle(.orange)
                    FlashBanner(flash: m.flash)
                    Button("Skip") { m.skip() }.buttonStyle(.bordered)
                }
            case .done:
                ResultsView(game: .sprint, score: m.score, isBest: m.isBest,
                            lines: ["Signed: \(m.hits)", "Missed or skipped: \(m.misses)",
                                    "Accuracy: \(m.accuracy.map { "\(Int($0 * 100))%" } ?? "–")",
                                    "Average time to sign: \(m.avgReactionMs.map { String(format: "%.1fs", $0 / 1000) } ?? "–")",
                                    "Best combo: \(m.bestCombo)"],
                            practise: m.practise) { m.start(store) }
            }
        }
        .navigationTitle(GameKind.sprint.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
