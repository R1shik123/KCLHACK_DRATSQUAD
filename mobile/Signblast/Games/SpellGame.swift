import SwiftUI

/// Spell It: an emoji clue and its word. Fingerspell it letter by letter before the 90-second clock runs out.
/// The first word is always CAB.
final class SpellModel: GameModel {
    enum Phase { case ready, playing, done }

    @Published var phase: Phase = .ready
    @Published var word = WordBank.firstSpell
    @Published var pos = 0
    @Published var score = 0
    @Published var wordsDone = 0
    @Published var lettersDone = 0
    @Published var skipped = 0
    @Published var timeLeft = 90.0
    @Published var hintShown = false
    @Published var celebrating = false
    @Published var isBest = false

    let duration = 90.0
    private(set) var missed: [String: Int] = [:]
    private var queue: [SpellWord] = []
    private var letterAt = Date()
    private var endAt = Date()
    private var timer: Timer?

    var letters: [String] { word.word.map { String($0) } }
    var current: String { pos < letters.count ? letters[pos] : "" }
    var practise: [String] { missed.sorted { $0.value > $1.value }.prefix(3).map(\.key) }

    func start(_ store: ProgressStore) {
        self.store = store
        score = 0; wordsDone = 0; lettersDone = 0; skipped = 0; missed = [:]; isBest = false
        queue = [WordBank.firstSpell] + WordBank.spell.shuffled()
        endAt = Date().addingTimeInterval(duration)
        timeLeft = duration
        phase = .playing
        nextWord()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
    }

    private func tick() {
        guard phase == .playing else { return }
        timeLeft = max(0, endAt.timeIntervalSinceNow)
        if timeLeft <= 0 { finish() }
    }

    private func nextWord() {
        if queue.isEmpty { queue = WordBank.spell.shuffled() }
        word = queue.removeFirst()
        pos = 0
        hintShown = false
        celebrating = false
        letterAt = Date()
    }

    override func sign(_ letter: String) {
        guard phase == .playing, !celebrating else { return }
        guard letter == current else {
            say("That looks like \(letter), you need \(current)", good: false)
            return
        }
        store.hit(letter, ms: Date().timeIntervalSince(letterAt) * 1000)
        score += hintShown ? 25 : 50
        lettersDone += 1
        pos += 1
        hintShown = false
        letterAt = Date()
        if pos == letters.count {
            wordsDone += 1
            score += 200
            celebrating = true
            say("\(word.emoji) \(word.word)!", good: true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in
                guard let self, self.phase == .playing else { return }
                self.nextWord()
            }
        } else {
            Feedback.tap()
        }
    }

    func hint() { hintShown = true }

    func skipWord() {
        guard phase == .playing, !celebrating else { return }
        store.miss(current)
        missed[current, default: 0] += 1
        skipped += 1
        say("Skipped \(word.word)", good: false)
        nextWord()
    }

    private func finish() {
        timer?.invalidate()
        phase = .done
        let tries = lettersDone + skipped
        isBest = store.finish(.spell, score: score, accuracy: tries > 0 ? Double(lettersDone) / Double(tries) : nil)
    }

    override func stop() {
        timer?.invalidate()
        timer = nil
        if phase == .playing { phase = .ready }
    }
}

struct SpellView: View {
    @EnvironmentObject private var store: ProgressStore
    @StateObject private var m = SpellModel()

    var body: some View {
        GameScreen(model: m, showInput: m.phase == .playing) {
            switch m.phase {
            case .ready:
                ReadyCard(game: .spell,
                          rules: ["90 seconds on the clock", "Fingerspell the word, one letter at a time", "+50 a letter (+25 with a hint), +200 a word", "Stuck? Use a hint or skip the word"],
                          best: store.best(.spell)) { m.start(store) }
            case .playing:
                VStack(spacing: 10) {
                    HStack {
                        StatChip(label: "Time", value: "\(Int(m.timeLeft.rounded(.up)))")
                        StatChip(label: "Score", value: "\(m.score)")
                        StatChip(label: "Words", value: "\(m.wordsDone)")
                    }
                    Text(m.word.emoji).font(.system(size: 64))
                    HStack(spacing: 8) {
                        ForEach(Array(m.letters.enumerated()), id: \.offset) { i, letter in
                            Text(letter)
                                .font(.system(size: 38, weight: .bold, design: .rounded))
                                .frame(width: 44, height: 54)
                                .background(i == m.pos ? Color.accentColor.opacity(0.2) : Color(.secondarySystemBackground),
                                            in: RoundedRectangle(cornerRadius: 8))
                                .foregroundStyle(i < m.pos ? Color.green : Color.primary)
                        }
                    }
                    .accessibilityIdentifier("spell-word")
                    Text(m.hintShown ? "\(m.current): \(Signs.handshapes[m.current] ?? "")" : " ")
                        .font(.footnote).foregroundStyle(.orange).multilineTextAlignment(.center)
                        .frame(minHeight: 36)
                    FlashBanner(flash: m.flash)
                    HStack {
                        Button("Hint") { m.hint() }.buttonStyle(.bordered)
                        Button("Skip word") { m.skipWord() }.buttonStyle(.bordered)
                    }
                }
            case .done:
                ResultsView(game: .spell, score: m.score, isBest: m.isBest,
                            lines: ["Words spelled: \(m.wordsDone)", "Letters signed: \(m.lettersDone)", "Words skipped: \(m.skipped)"],
                            practise: m.practise) { m.start(store) }
            }
        }
        .navigationTitle(GameKind.spell.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
