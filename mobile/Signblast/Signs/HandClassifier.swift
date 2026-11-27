import Foundation

/// One hand landmark. y grows downwards (image coordinates). Units don't matter: every feature is a ratio.
struct HandPoint {
    var x: Double
    var y: Double
    var z: Double = 0
}

struct HandFeatures {
    /// [thumb out, index, middle, ring, pinky extension, index–middle spread], each 0…1
    var v: [Double]
    var dTouch: Double
    /// 1 = hand upright, 0 = sideways, -1 = pointing down
    var up: Double
    var thumbTo: [Int: Double]
    var tipsToThumb: Double
    var crossed: Bool
}

struct Classification {
    var letter: String?     // nil unless confident
    var guess: String       // closest letter even when not confident
    var confidence: Double
    var distance: Double
}

/// Port of the web recogniser (app/recognizer.js): 21 hand landmarks -> ASL letter.
/// Landmark order is MediaPipe's, which Apple Vision's hand pose joints map onto one-to-one:
/// 0 wrist, 1–4 thumb, 5–8 index, 9–12 middle, 13–16 ring, 17–20 little finger (MCP, PIP, DIP, tip).
enum HandClassifier {
    static let allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".map { String($0) }
    /// Validated letters. The rest are best effort (orientation, thumb position, crossing, motion).
    static let solidLetters: Set<String> = ["A", "B", "C", "D", "F", "I", "L", "U", "V", "W", "Y"]

    // [thumb, index, middle, ring, pinky, spread]
    static let templates: [String: [Double]] = [
        "A": [0.45, 0, 0, 0, 0, 0.1],
        "B": [0.15, 1, 1, 1, 1, 0.1],
        "C": [0.6, 0.5, 0.5, 0.5, 0.5, 0.2],
        "D": [0.3, 1, 0, 0, 0, 0],
        "I": [0.3, 0, 0, 0, 1, 0],
        "L": [1, 1, 0, 0, 0, 0],
        "V": [0.3, 1, 1, 0, 0, 0.8],
        "Y": [1, 0, 0, 0, 1, 0],
        "U": [0.3, 1, 1, 0, 0, 0],
        "W": [0.3, 1, 1, 1, 0, 0.5],
        "F": [0.3, 0, 1, 1, 1, 0],
        "E": [0.1, 0, 0, 0, 0, 0],
        "S": [0.25, 0, 0, 0, 0, 0],
        "T": [0.3, 0, 0, 0, 0, 0],
        "M": [0.2, 0, 0, 0, 0, 0],
        "N": [0.2, 0, 0, 0, 0, 0],
        "O": [0.45, 0.4, 0.4, 0.4, 0.4, 0.1],
        "G": [0.7, 1, 0, 0, 0, 0],
        "H": [0.3, 1, 1, 0, 0, 0],
        "K": [0.7, 1, 1, 0, 0, 0.5],
        "P": [0.7, 1, 1, 0, 0, 0.5],
        "Q": [0.7, 1, 0, 0, 0, 0],
        "R": [0.3, 1, 1, 0, 0, 0],
        "X": [0.3, 0.45, 0, 0, 0, 0],
        "J": [0.3, 0, 0, 0, 1, 0],
        "Z": [0.3, 1, 0, 0, 0, 0],
    ]
    static let weights: [Double] = [0.7, 1, 1, 1, 1, 0.6]
    static let accept = 0.3     // max weighted distance to accept a letter
    static let margin = 0.05    // best must beat the runner-up by this much

    private static func clamp(_ v: Double, _ a: Double = 0, _ b: Double = 1) -> Double { max(a, min(b, v)) }
    private static func dist(_ p: HandPoint, _ q: HandPoint) -> Double {
        let dx = p.x - q.x, dy = p.y - q.y, dz = (p.z - q.z) * 0.5
        return (dx * dx + dy * dy + dz * dz).squareRoot()
    }

    static func features(_ lm: [HandPoint]) -> HandFeatures {
        let palm = max(dist(lm[0], lm[9]), 1e-6)
        func ext(_ tip: Int, _ mcp: Int) -> Double {
            clamp((dist(lm[0], lm[tip]) / max(dist(lm[0], lm[mcp]), 1e-6) - 1.1) / 0.75)
        }
        let i = ext(8, 5), m = ext(12, 9)
        // Spread only means something when index and middle are both up (V vs B).
        let spread = clamp((dist(lm[8], lm[12]) / palm - 0.15) / 0.3) * min(i, m)
        var thumbTo: [Int: Double] = [:]
        for k in [6, 8, 9, 10, 13] { thumbTo[k] = dist(lm[4], lm[k]) / palm }
        let tips = [8, 12, 16, 20].reduce(0.0) { $0 + dist(lm[4], lm[$1]) / palm } / 4
        return HandFeatures(
            v: [clamp((dist(lm[4], lm[5]) / palm - 0.25) / 0.5), i, m, ext(16, 13), ext(20, 17), spread],
            dTouch: dist(lm[4], lm[12]) / palm,
            up: clamp((lm[0].y - lm[9].y) / palm, -1, 1),
            thumbTo: thumbTo,
            tipsToThumb: tips,
            crossed: (lm[8].x - lm[12].x) * (lm[6].x - lm[10].x) < 0
        )
    }

    // Extra penalties from orientation, thumb position and crossing (same numbers as the web version).
    private static func upP(_ f: HandFeatures) -> Double { 0.35 * max(0, 0.45 - f.up) }
    private static func sideP(_ f: HandFeatures) -> Double { 0.35 * max(0, abs(f.up) - 0.45) }
    private static func downP(_ f: HandFeatures) -> Double { 0.35 * max(0, f.up + 0.2) }
    private static func near(_ d: Double?, _ r: Double = 0.35) -> Double { 0.4 * max(0, (d ?? 9) - r) }

    private static func extra(_ letter: String, _ f: HandFeatures) -> Double {
        switch letter {
        case "D", "I", "V", "X": return upP(f)
        case "U": return upP(f) + (f.crossed ? 0.15 : 0)
        case "K": return upP(f) + near(f.thumbTo[10], 0.4)
        case "E": return near(f.tipsToThumb, 0.45)
        case "S": return near(f.thumbTo[10], 0.3)
        case "T": return near(f.thumbTo[6], 0.3)
        case "M": return near(f.thumbTo[13], 0.3)
        case "N": return near(f.thumbTo[9], 0.3)
        case "O": return near(f.thumbTo[8], 0.25)
        case "G", "Z", "J": return sideP(f)
        case "H": return sideP(f) + (f.crossed ? 0.15 : 0)
        case "P": return downP(f) + near(f.thumbTo[10], 0.45)
        case "Q": return downP(f)
        case "R": return upP(f) + (f.crossed ? 0 : 0.25)
        default: return 0
        }
    }

    static func classify(_ lm: [HandPoint]) -> Classification {
        let f = features(lm)
        let wsum = weights.reduce(0, +)
        let scores: [(String, Double)] = allLetters.map { L in
            let t = templates[L]!
            var d = 0.0
            for i in 0..<6 { d += weights[i] * pow(f.v[i] - t[i], 2) }
            d = (d / wsum).squareRoot()
            if L == "D" { d += max(0, f.dTouch - 0.45) * 0.4 }  // D: thumb meets the middle finger
            if L == "C" { d += max(0, 0.35 - f.dTouch) * 0.5 + max(0, 0.3 - (f.thumbTo[8] ?? 1)) * 0.6 }  // C keeps a gap
            d += extra(L, f)
            return (L, d)
        }.sorted { $0.1 < $1.1 }
        let (best, d1) = scores[0]
        let d2 = scores[1].1
        let ok = d1 < accept && d2 - d1 > margin
        let confidence = clamp(1 - d1 / accept) * clamp((d2 - d1) / (margin * 3), 0.4, 1)
        return Classification(letter: ok ? best : nil, guess: best, confidence: ok ? confidence : 0, distance: d1)
    }

    /// Two hands in view: keep the more useful reading (same rule as the web version).
    static func better(_ c: Classification, than o: Classification?) -> Bool {
        guard let o else { return true }
        if c.letter != nil && o.letter == nil { return true }
        if (c.letter != nil) == (o.letter != nil) && c.confidence > o.confidence { return true }
        if c.letter == nil && o.letter == nil && c.distance < o.distance { return true }
        return false
    }
}
