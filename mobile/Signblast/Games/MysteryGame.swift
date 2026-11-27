import SwiftUI

/// Mystery Word: a hidden word with a category clue. Sign letters to guess; 6 wrong guesses per word.
/// Solve words to keep going; the game ends on the first word you don't solve.
final class MysteryModel: GameModel {
    enum Phase { case ready, playing, solved, done }

    @Published var phase: Phase = .ready
    @Published var word = ""
    @Published var clue = ""
    @Published var guessed: [String] = []
    @Published var wrong = 0
    @Published var score = 0
    @Published var solved = 0
    @Published var isBest = false

    let lives = 6
    private var queue: [(word: String, clue: String)] = []
    private var gen = 0

    var masked: [String] { word.map { guessed.contains(String($0)) ? String($0) : "_" } }
    var wrongLetters: [String] { guessed.filter { !word.contains($0) } }
    var isSolved: Bool { Set(word.map { String($0) }).isSubset(of: Set(guessed)) }

    func start(_ store: ProgressStore) {
        self.store = store
        score = 0; solved = 0; isBest = false
        queue = WordBank.mystery.shuffled()
        nextWord()
    }

    private func nextWord() {
        if queue.isEmpty { queue = WordBank.mystery.shuffled() }
        let next = queue.removeFirst()
        word = next.word
        clue = next.clue
        guessed = []
        wrong = 0
        phase = .playing
    }

    override func sign(_ letter: String) {
        guard phase == .playing else { return }
        guard !guessed.contains(letter) else {
            say("Already tried \(letter)", good: false)
            return
        }
        guessed.append(letter)
        if word.contains(letter) {
            if isSolved {
                solved += 1
                score += 100 + 20 * (lives - wrong)
                phase = .solved
                say("Solved: \(word)!", good: true)
                gen += 1
                let g = gen
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
                    guard let self, self.gen == g, self.phase == .solved else { return }
                    self.nextWord()
                }
            } else {
                say("Yes, \(letter) is in it", good: true)
            }
        } else {
            wrong += 1
            if wrong >= lives {
                phase = .done
                Feedback.bad()
                isBest = store.finish(.mystery, score: score, accuracy: nil)
            } else {
                say("No \(letter)", good: false)
            }
        }
    }

    override func stop() {
        gen += 1
        if phase == .playing || phase == .solved { phase = .ready }
    }
}

struct MysteryView: View {
    @EnvironmentObject private var store: ProgressStore
    @StateObject private var m = MysteryModel()

    var body: some View {
        GameScreen(model: m, showInput: m.phase == .playing || m.phase == .solved) {
            switch m.phase {
            case .ready:
                ReadyCard(game: .mystery,
                          rules: ["A hidden word and a clue", "Sign a letter to guess it", "6 wrong guesses per word", "Solve words to keep going"],
                          best: store.best(.mystery)) { m.start(store) }
            case .playing, .solved:
                VStack(spacing: 12) {
                    HStack {
                        StatChip(label: "Score", value: "\(m.score)")
                        StatChip(label: "Solved", value: "\(m.solved)")
                        StatChip(label: "Lives", value: "\(m.lives - m.wrong)")
                    }
                    Text("Clue: \(m.clue)").font(.headline)
                    HStack(spacing: 6) {
                        ForEach(Array(m.masked.enumerated()), id: \.offset) { _, c in
                            Text(c)
                                .font(.system(size: 34, weight: .bold, design: .monospaced))
                                .frame(width: 36)
                        }
                    }
                    .accessibilityIdentifier("mystery-word")
                    Text(String(repeating: "♥", count: m.lives - m.wrong) + String(repeating: "♡", count: m.wrong))
                        .font(.title2).foregroundStyle(.pink)
                    Text("Wrong: \(m.wrongLetters.isEmpty ? "none" : m.wrongLetters.joined(separator: " "))")
                        .foregroundStyle(.secondary)
                    FlashBanner(flash: m.flash)
                }
            case .done:
                ResultsView(game: .mystery, score: m.score, isBest: m.isBest,
                            lines: ["Words solved: \(m.solved)", "The last word was \(m.word) (\(m.clue))",
                                    "Letters tried on it: \(m.guessed.joined(separator: " "))"],
                            practise: []) { m.start(store) }
            }
        }
        .navigationTitle(GameKind.mystery.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
