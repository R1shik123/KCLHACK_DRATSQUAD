import Foundation

enum Signs {
    static let all = HandClassifier.allLetters
    /// Letters the camera reads reliably. Speed and memory games use these by default.
    static let solid = all.filter { HandClassifier.solidLetters.contains($0) }
    static func isSolid(_ letter: String) -> Bool { HandClassifier.solidLetters.contains(letter) }

    static let handshapes: [String: String] = [
        "A": "Make a fist. Rest your thumb against the side of your index finger, pointing up.",
        "B": "Hold your four fingers straight up and together. Fold your thumb across your palm.",
        "C": "Curve your fingers and thumb into a C, as if holding a cup. Leave a gap between thumb and fingers.",
        "D": "Point your index finger straight up. Curl the other fingers down to touch your thumb tip, making a circle.",
        "E": "Curl all four fingertips down to rest on your thumb, tucked across your palm.",
        "F": "Touch your index fingertip to your thumb tip in a circle. Hold the other three fingers up and apart.",
        "G": "Point your index finger sideways with your thumb parallel above it, like a small pinch.",
        "H": "Point your index and middle fingers sideways, together, thumb tucked.",
        "I": "Make a fist and raise your little finger (pinky) straight up. Thumb rests across your fingers.",
        "J": "Make an I (little finger up) and draw a J in the air with it.",
        "K": "Index and middle fingers up in a V, with your thumb touching the middle finger between them.",
        "L": "Point your index finger up and your thumb out to the side, making an L. Fold the other fingers.",
        "M": "Fold your thumb under your index, middle and ring fingers.",
        "N": "Fold your thumb under your index and middle fingers.",
        "O": "Curve all your fingertips to touch your thumb tip, making an O.",
        "P": "Make a K, then point it down.",
        "Q": "Make a G, then point it down.",
        "R": "Cross your middle finger over your index finger.",
        "S": "Make a fist with your thumb wrapped across the front of your fingers.",
        "T": "Make a fist with your thumb tucked between your index and middle fingers.",
        "U": "Hold your index and middle fingers straight up and together. Fold the other fingers under your thumb.",
        "V": "Raise your index and middle fingers in a V, spread apart. Fold the other fingers under your thumb.",
        "W": "Hold your index, middle and ring fingers up and spread. Touch your thumb to your little finger.",
        "X": "Raise your index finger and bend it into a hook.",
        "Y": "Stretch your thumb and little finger out. Fold the three middle fingers down.",
        "Z": "Point your index finger and draw a Z in the air.",
    ]

    static let hints: [String: String] = [
        "A": "Fist, thumb at side", "B": "Flat hand, thumb in", "C": "Curve into a C", "D": "Index up, O below",
        "E": "Fingers curl on thumb", "F": "OK sign, 3 up", "G": "Index points sideways", "H": "2 fingers sideways",
        "I": "Fist, pinky up", "J": "I + draw a J", "K": "V with thumb between", "L": "Thumb + index = L",
        "M": "Thumb under 3 fingers", "N": "Thumb under 2 fingers", "O": "Fingertips make O", "P": "K pointing down",
        "Q": "G pointing down", "R": "Cross 2 fingers", "S": "Fist, thumb across", "T": "Thumb under index",
        "U": "2 fingers together", "V": "Two fingers, spread", "W": "3 fingers spread", "X": "Hook the index",
        "Y": "Thumb + pinky out", "Z": "Index draws a Z",
    ]
}

struct SpellWord: Equatable {
    let word: String
    let emoji: String
}

enum WordBank {
    /// Spell It always starts with CAB.
    static let firstSpell = SpellWord(word: "CAB", emoji: "🚕")
    static let spell: [SpellWord] = [
        .init(word: "CAT", emoji: "🐱"), .init(word: "DOG", emoji: "🐶"), .init(word: "SUN", emoji: "☀️"),
        .init(word: "BUS", emoji: "🚌"), .init(word: "CUP", emoji: "☕️"), .init(word: "BED", emoji: "🛏️"),
        .init(word: "FISH", emoji: "🐟"), .init(word: "BIRD", emoji: "🐦"), .init(word: "CAKE", emoji: "🎂"),
        .init(word: "LION", emoji: "🦁"), .init(word: "BOOK", emoji: "📚"), .init(word: "MILK", emoji: "🥛"),
        .init(word: "BABY", emoji: "👶"), .init(word: "BALL", emoji: "⚽️"), .init(word: "TREE", emoji: "🌳"),
        .init(word: "CAR", emoji: "🚗"), .init(word: "HAT", emoji: "🎩"), .init(word: "KEY", emoji: "🔑"),
        .init(word: "PIZZA", emoji: "🍕"), .init(word: "APPLE", emoji: "🍎"), .init(word: "MOON", emoji: "🌙"),
        .init(word: "STAR", emoji: "⭐️"), .init(word: "FROG", emoji: "🐸"), .init(word: "BEE", emoji: "🐝"),
        .init(word: "COW", emoji: "🐮"), .init(word: "PIG", emoji: "🐷"), .init(word: "EGG", emoji: "🥚"),
        .init(word: "ICE", emoji: "🧊"), .init(word: "DUCK", emoji: "🦆"),
    ]

    // Echo words come from the shared list (design/words.json) so the website picks from exactly the same pool.
    // Up to Expert: only reliable letters and no doubled letters, so every sign is one the camera reads well.
    private static func isCameraFriendly(_ w: String) -> Bool {
        w.allSatisfy { HandClassifier.solidLetters.contains(String($0)) } && zip(w, w.dropFirst()).allSatisfy { $0 != $1 }
    }
    static var echo3: [String] { DS.wordList.filter { $0.count == 3 && isCameraFriendly($0) } }
    static var echo45: [String] { DS.wordList.filter { (4...6).contains($0.count) && isCameraFriendly($0) } }
    /// Expert: any 3–5-letter word (hold a sign again to repeat a letter).
    static var echoExpert: [String] { DS.wordList.filter { (3...5).contains($0.count) } }

    static let mystery: [(word: String, clue: String)] = [
        ("PIZZA", "Food"), ("TIGER", "Animal"), ("RIVER", "Nature"), ("GUITAR", "Music"), ("PLANET", "Space"),
        ("ROBOT", "Tech"), ("CASTLE", "Place"), ("BANANA", "Food"), ("WINTER", "Season"), ("JACKET", "Clothes"),
        ("ROCKET", "Space"), ("PENCIL", "School"), ("GARDEN", "Place"), ("DRAGON", "Fantasy"), ("COFFEE", "Drink"),
        ("SOCCER", "Sport"), ("TURTLE", "Animal"), ("CAMERA", "Tech"), ("ISLAND", "Place"), ("SUMMER", "Season"),
        ("CHEESE", "Food"), ("PURPLE", "Colour"), ("LONDON", "City"), ("FRIEND", "People"), ("BRIDGE", "Place"),
        ("VIOLIN", "Music"), ("ZEBRA", "Animal"), ("CLOUD", "Weather"), ("HONEY", "Food"), ("MAGIC", "Fantasy"),
    ]
}
