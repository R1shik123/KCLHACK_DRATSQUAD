import Foundation

enum GameKind: String, CaseIterable, Identifiable, Codable {
    case sprint, spell, echo, mystery
    var id: String { rawValue }

    var title: String {
        switch self {
        case .sprint: return "Sign Sprint"
        case .spell: return "Spell It"
        case .echo: return "Echo"
        case .mystery: return "Mystery Word"
        }
    }
    var blurb: String {
        switch self {
        case .sprint: return "60 seconds. Sign each letter as fast as you can."
        case .spell: return "Fingerspell words from emoji clues."
        case .echo: return Copy.t("games.echo.body")
        case .mystery: return "Guess the hidden word by signing letters."
        }
    }
    var symbol: String {
        switch self {
        case .sprint: return "bolt.fill"
        case .spell: return "textformat.abc"
        case .echo: return "brain.head.profile"
        case .mystery: return "questionmark.square.dashed"
        }
    }
}

struct LetterStat: Codable {
    var hits = 0
    var misses = 0
    var totalMs = 0.0
    var timed = 0
}

struct RoundRecord: Codable, Identifiable {
    var id = UUID()
    var game: GameKind
    var score: Int
    var date: Date
    var accuracy: Double?
}

struct SaveData: Codable {
    var boxes: [String: Int] = [:]          // Leitner box per letter, 1…5 (missing = new)
    var letters: [String: LetterStat] = [:]
    var days: [String: Int] = [:]           // "yyyy-MM-dd" -> sessions that day
    var bests: [String: Int] = [:]
    var history: [RoundRecord] = []
    var echoStars: [String: Int]? = nil     // Echo: best stars per cleared level (optional so older saves still load)
}

/// Everything the learner has done, saved on this phone (UserDefaults). Nothing is sent anywhere.
final class ProgressStore: ObservableObject {
    @Published private(set) var data = SaveData()
    private let key = "signblast.ios.v1"
    /// Spawn weight by box (index 0 = new letter). Weak letters come up about 3x as often as mastered ones.
    static let boxWeight: [Double] = [3, 3, 2, 1.4, 1, 1]

    init() {
        if let raw = UserDefaults.standard.data(forKey: key),
           let saved = try? JSONDecoder().decode(SaveData.self, from: raw) {
            data = saved
        }
    }

    private func save() {
        if let raw = try? JSONEncoder().encode(data) { UserDefaults.standard.set(raw, forKey: key) }
    }

    func box(_ letter: String) -> Int { data.boxes[letter] ?? 0 }
    func stat(_ letter: String) -> LetterStat { data.letters[letter] ?? LetterStat() }
    func best(_ game: GameKind) -> Int { data.bests[game.rawValue] ?? 0 }

    /// Signed correctly: up one box.
    func hit(_ letter: String, ms: Double? = nil) {
        data.boxes[letter] = min(5, max(1, box(letter)) + 1)
        var s = stat(letter)
        s.hits += 1
        if let ms { s.totalMs += ms; s.timed += 1 }
        data.letters[letter] = s
        save()
    }

    /// Missed or skipped: back to box 1.
    func miss(_ letter: String) {
        data.boxes[letter] = 1
        var s = stat(letter)
        s.misses += 1
        data.letters[letter] = s
        save()
    }

    /// Leitner-weighted pick, never the same letter twice in a row.
    func pick(from pool: [String], avoiding: String? = nil) -> String {
        let list = pool.count > 1 ? pool.filter { $0 != avoiding } : pool
        guard !list.isEmpty else { return "A" }
        let weights = list.map { Self.boxWeight[min(5, box($0))] }
        var r = Double.random(in: 0..<weights.reduce(0, +))
        for (letter, w) in zip(list, weights) {
            r -= w
            if r < 0 { return letter }
        }
        return list[list.count - 1]
    }

    /// Records a finished round. Returns true for a new best.
    @discardableResult
    func finish(_ game: GameKind, score: Int, accuracy: Double?) -> Bool {
        let isBest = score > best(game)
        if isBest { data.bests[game.rawValue] = score }
        data.history.append(RoundRecord(game: game, score: score, date: Date(), accuracy: accuracy))
        if data.history.count > 50 { data.history.removeFirst(data.history.count - 50) }
        markToday()
        return isBest
    }

    func markToday() {
        data.days[Self.dayKey(Date()), default: 0] += 1
        save()
    }

    // MARK: Echo level path

    var echoHighest: Int { (data.echoStars ?? [:]).keys.compactMap { Int($0) }.max() ?? 0 }
    var echoTotalStars: Int { (data.echoStars ?? [:]).values.reduce(0, +) }
    func echoStars(_ level: Int) -> Int { data.echoStars?[String(level)] ?? 0 }

    /// Records a cleared level (keeps its best stars). Returns true if this unlocked a new level.
    @discardableResult
    func recordEcho(level: Int, stars: Int) -> Bool {
        let before = echoHighest
        var map = data.echoStars ?? [:]
        map[String(level)] = max(map[String(level)] ?? 0, stars)
        data.echoStars = map
        finish(.echo, score: echoHighest, accuracy: nil)   // best for Echo = highest level cleared
        return level > before
    }

    func reset() {
        data = SaveData()
        save()
    }

    // MARK: derived stats

    static func dayKey(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    var practisedToday: Bool { data.days[Self.dayKey(Date())] != nil }

    var streak: Int {
        let cal = Calendar.current
        var d = Date()
        if data.days[Self.dayKey(d)] == nil { d = cal.date(byAdding: .day, value: -1, to: d) ?? d }
        var n = 0
        while data.days[Self.dayKey(d)] != nil {
            n += 1
            d = cal.date(byAdding: .day, value: -1, to: d) ?? d
        }
        return n
    }

    var mastered: Int { Signs.all.filter { box($0) >= 4 }.count }

    var accuracy: Double? {
        let t = data.letters.values.reduce((0, 0)) { ($0.0 + $1.hits, $0.1 + $1.misses) }
        return t.0 + t.1 > 0 ? Double(t.0) / Double(t.0 + t.1) : nil
    }

    var avgReactionMs: Double? {
        let t = data.letters.values.reduce((0.0, 0)) { ($0.0 + $1.totalMs, $0.1 + $1.timed) }
        return t.1 > 0 ? t.0 / Double(t.1) : nil
    }

    /// Lowest accuracy first, among letters tried at least 3 times.
    var hardest: [(letter: String, accuracy: Double)] {
        let rows: [(letter: String, accuracy: Double)] = Signs.all.compactMap { letter in
            let s = stat(letter), n = s.hits + s.misses
            guard n >= 3 else { return nil }
            let a = Double(s.hits) / Double(n)
            return a < 1 ? (letter, a) : nil
        }
        return Array(rows.sorted { $0.accuracy < $1.accuracy }.prefix(3))
    }
}
