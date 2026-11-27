import SwiftUI
import UIKit

/// Reads the shared UI contract (`design/tokens.json`, `design/copy.json`) that the build phase copies into the bundle.
/// Never hard-code a colour, size or string that lives there (docs/COLLAB.md). The website reads the same files.
enum DS {
    static let tokens = load("tokens")
    static let copy = load("copy")
    static let words = load("words")
    /// The shared word list (design/words.json).
    static var wordList: [String] { (words["words"] as? [String]) ?? [] }

    private static func load(_ name: String) -> [String: Any] {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    static func value(_ path: String, in root: [String: Any]) -> Any? {
        var node: Any? = root
        for key in path.split(separator: ".") { node = (node as? [String: Any])?[String(key)] }
        return node
    }

    // MARK: colour roles (light + dark)

    static func color(_ role: String) -> Color {
        let light = uiColor(value("color.light.\(role)", in: tokens) as? String)
        let dark = uiColor(value("color.dark.\(role)", in: tokens) as? String)
        return Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }

    private static func uiColor(_ hex: String?) -> UIColor {
        guard var h = hex?.trimmingCharacters(in: .whitespaces), h.hasPrefix("#") else { return .magenta } // missing token: obvious
        h.removeFirst()
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return .magenta }
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                       blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    // MARK: type, space, radius

    /// Type scale from tokens. The contract's face is Inter Tight; until the .ttf is bundled the system face is used
    /// (it is first in the contract's fallback list).
    static func font(_ style: String) -> Font {
        let size = (value("type.\(style).size", in: tokens) as? Double) ?? 17
        let weight = (value("type.\(style).weight", in: tokens) as? Int) ?? 400
        return .system(size: size, weight: weight >= 600 ? .semibold : weight >= 500 ? .medium : .regular)
    }

    static func space(_ key: String) -> CGFloat { CGFloat((value("space.\(key)", in: tokens) as? Double) ?? 16) }
    static func radius(_ key: String) -> CGFloat { CGFloat((value("radius.\(key)", in: tokens) as? Double) ?? 12) }
    static func size(_ key: String) -> CGFloat { CGFloat((value("size.\(key)", in: tokens) as? Double) ?? 44) }
}

/// UI strings from `design/copy.json`, with `{name}` placeholders filled in.
enum Copy {
    static func t(_ path: String, _ args: [String: Any] = [:]) -> String {
        var s = (DS.value(path, in: DS.copy) as? String) ?? path   // a missing key shows its path, so it's easy to spot
        for (k, v) in args { s = s.replacingOccurrences(of: "{\(k)}", with: "\(v)") }
        return s
    }
}

extension View {
    /// The contract's eyebrow: small, uppercase, muted, tracked.
    func eyebrowStyle() -> some View {
        self.font(DS.font("eyebrow")).textCase(.uppercase).tracking(0.72).foregroundStyle(DS.color("muted"))
    }
}
