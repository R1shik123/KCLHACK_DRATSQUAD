import SwiftUI

// Echo: a memory game on a level path (docs/PRODUCT.md → "Echo"). Screens E1 Level path, E2 Echo play, E3 Echo result.
// Mobile-game structure (path, stars, hearts, boss levels), calm styling from design/tokens.json and design/copy.json.

// MARK: - Level rules

struct EchoLevel: Equatable {
    enum Stage: String, CaseIterable { case letters, moreLetters, words, longWords, pairs, expert }

    let number: Int

    var isBoss: Bool { number % 5 == 0 }
    var rounds: Int { isBoss ? 4 : 3 }

    var stage: Stage {
        switch number {
        case ...5: return .letters
        case ...10: return .moreLetters
        case ...15: return .words
        case ...20: return .longWords
        case ...25: return .pairs
        default: return .expert
        }
    }

    var usesWords: Bool { stage != .letters && stage != .moreLetters }

    /// Letters per round (letter stages) or words per round (word stages). Boss levels add one.
    var items: Int {
        let boss = isBoss ? 1 : 0
        switch stage {
        case .letters: return [2, 2, 3, 3, 3][max(0, min(4, number - 1))] + boss
        case .moreLetters: return 4 + (number - 6) / 2 + boss
        case .words, .longWords: return 1 + boss
        case .pairs, .expert: return 2 + boss
        }
    }

    /// How long each letter is shown (a word shows for this × its length, at least 1.2 s).
    var secondsPerLetter: Double {
        switch stage {
        case .letters: return 1.0
        case .moreLetters: return 0.9 - 0.035 * Double(number - 6)
        case .words: return 0.5
        case .longWords, .pairs: return 0.45
        case .expert: return max(0.3, 0.4 - 0.005 * Double(number - 26))
        }
    }

    var wordPool: [String] {
        switch stage {
        case .words, .pairs: return WordBank.echo3
        case .longWords: return WordBank.echo45
        default: return WordBank.echoExpert
        }
    }

    var introText: String {
        let what: String
        if !usesWords { what = Copy.t("echo.itemsLetters", ["count": items]) }
        else if items == 1 { what = Copy.t("echo.itemsWord") }
        else { what = Copy.t("echo.itemsWords", ["count": items]) }
        return Copy.t("echo.intro", ["rounds": rounds, "items": what])
    }
}

// MARK: - Game model (E2)

final class EchoModel: GameModel {
    enum Phase { case intro, watch, input, cleared, failed }

    @Published var level = EchoLevel(number: 1)
    @Published var phase: Phase = .intro
    @Published var round = 1
    @Published var items: [String] = []
    @Published var shownIndex: Int?          // item on screen during Watch
    @Published var entered = 0               // letters signed back so far this round
    @Published var hearts = 3
    @Published var showAgainUsed = false
    @Published var note: String?             // neutral status line ("Round complete", "Not quite…")
    @Published var stars = 0
    @Published var unlocked = false

    private var gen = 0
    private var heartsLost = 0
    private var usedWords: Set<String> = []
    private var promptAt = Date()

    /// Every letter to sign back this round, in order.
    var targets: [String] { items.joined().map { String($0) } }

    func prepare(_ store: ProgressStore, level n: Int) {
        self.store = store
        gen += 1
        level = EchoLevel(number: max(1, n))
        phase = .intro
        items = []
        note = nil
    }

    func begin() {
        round = 1; hearts = 3; heartsLost = 0; showAgainUsed = false; usedWords = []; stars = 0; unlocked = false
        note = nil
        newRound()
    }

    private func newRound() {
        items = makeItems()
        play()
    }

    private func makeItems() -> [String] {
        if level.usesWords {
            var pool = level.wordPool.filter { !usedWords.contains($0) }
            if pool.count < level.items { usedWords = []; pool = level.wordPool }
            var out: [String] = []
            for _ in 0..<level.items {
                guard let w = pool.randomElement() else { break }
                pool.removeAll { $0 == w }
                usedWords.insert(w)
                out.append(w)
            }
            return out
        }
        var out: [String] = []
        for _ in 0..<level.items { out.append(store.pick(from: Signs.solid, avoiding: out.last)) }
        return out
    }

    /// Watch: show each item, then hand over to the player.
    private func play() {
        gen += 1
        let g = gen
        phase = .watch
        entered = 0
        shownIndex = nil
        var t = 0.7
        for (i, item) in items.enumerated() {
            let duration = level.usesWords ? max(1.2, Double(item.count) * level.secondsPerLetter) : level.secondsPerLetter
            after(t, g) { self.shownIndex = i; Feedback.tap() }
            after(t + duration, g) { self.shownIndex = nil }
            t += duration + 0.3
        }
        after(t, g) {
            self.note = nil
            self.phase = .input
            self.promptAt = Date()
        }
    }

    private func after(_ seconds: Double, _ g: Int, _ f: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self, self.gen == g else { return }
            f()
        }
    }

    func showAgain() {
        guard phase == .input, !showAgainUsed else { return }
        showAgainUsed = true
        play()
    }

    override func sign(_ letter: String) {
        guard phase == .input, entered < targets.count else { return }
        let want = targets[entered]
        if letter == want {
            store.hit(letter, ms: Date().timeIntervalSince(promptAt) * 1000)
            promptAt = Date()
            entered += 1
            if entered == targets.count { roundDone() } else { Feedback.tap() }
        } else {
            // Wrong letter: neutral feedback, lose a heart, watch the round again.
            store.miss(want)
            hearts -= 1
            heartsLost += 1
            Feedback.bad()
            if hearts <= 0 {
                gen += 1
                phase = .failed
                return
            }
            note = Copy.t("echo.missed")
            gen += 1
            let g = gen
            phase = .watch
            shownIndex = nil
            after(1.2, g) { self.play() }
        }
    }

    private func roundDone() {
        Feedback.good()
        if round >= level.rounds { complete(); return }
        round += 1
        note = Copy.t("echo.roundDone")
        gen += 1
        let g = gen
        phase = .watch
        after(1.0, g) { self.newRound() }
    }

    private func complete() {
        gen += 1
        let penalty = heartsLost + (showAgainUsed ? 1 : 0)
        stars = penalty == 0 ? 3 : (penalty == 1 ? 2 : 1)
        unlocked = store.recordEcho(level: level.number, stars: stars)
        phase = .cleared
    }

    override func stop() {
        gen += 1
        if phase == .watch || phase == .input { phase = .intro }
    }
}

// MARK: - E1 Level path

struct EchoMapView: View {
    @EnvironmentObject private var store: ProgressStore

    private var current: Int { store.echoHighest + 1 }
    private var shownLevels: [Int] { Array(1...max(15, current + 5)) }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: DS.space("sm")) {
                    Text(Copy.t("echo.eyebrow")).eyebrowStyle()
                    Text(Copy.t("echo.mapTitle")).font(DS.font("largeTitle")).foregroundStyle(DS.color("ink"))
                    Text(Copy.t("echo.mapBody")).font(DS.font("body")).foregroundStyle(DS.color("muted"))
                    HStack(spacing: DS.space("lg")) {
                        EchoStat(value: "\(store.echoTotalStars)", label: Copy.t("echo.starsTotal"))
                        EchoStat(value: "\(store.echoHighest)", label: Copy.t("echo.bestLevel"))
                    }
                    .padding(.top, DS.space("xs"))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, DS.space("sm"))

                LazyVStack(spacing: DS.space("md")) {
                    ForEach(shownLevels, id: \.self) { n in
                        let level = EchoLevel(number: n)
                        if n == 1 || EchoLevel(number: n - 1).stage != level.stage {
                            Text(Copy.t("echo.stages.\(level.stage.rawValue)")).eyebrowStyle()
                                .frame(maxWidth: .infinity)
                                .padding(.top, DS.space("lg"))
                        }
                        EchoNode(level: level, stars: store.echoStars(n), state: state(n))
                            .offset(x: sin(Double(n) * 0.9) * 80)   // the winding path
                            .id(n)
                    }
                }
                .padding(.vertical, DS.space("lg"))
            }
            .background(DS.color("bg"))
            .onAppear { DispatchQueue.main.async { proxy.scrollTo(current, anchor: .center) } }
        }
        .navigationTitle(Copy.t("echo.eyebrow"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func state(_ n: Int) -> EchoNode.State {
        n <= store.echoHighest ? .cleared : (n == current ? .current : .locked)
    }
}

struct EchoStat: View {
    let value: String
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: DS.space("xxs")) {
            Text(value).font(DS.font("title1").monospacedDigit()).foregroundStyle(DS.color("ink"))
            Text(label).font(DS.font("footnote")).foregroundStyle(DS.color("muted"))
        }
    }
}

struct EchoNode: View {
    enum State { case cleared, current, locked }
    let level: EchoLevel
    let stars: Int
    let state: State

    var body: some View {
        let size: CGFloat = level.isBoss ? 84 : 68
        let circle = VStack(spacing: DS.space("xxs")) {
            if level.isBoss {
                Image(systemName: "crown.fill").font(.system(size: 16)).foregroundStyle(DS.color(state == .locked ? "muted" : "ink"))
            }
            ZStack {
                Circle()
                    .fill(state == .current ? DS.color("accent") : DS.color("surface"))
                    .frame(width: size, height: size)
                if state == .locked {
                    Image(systemName: "lock.fill").font(.system(size: 20)).foregroundStyle(DS.color("muted"))
                } else {
                    Text("\(level.number)")
                        .font(DS.font("title2").monospacedDigit())
                        .foregroundStyle(state == .current ? DS.color("accentInk") : DS.color("ink"))
                }
            }
            if state == .cleared {
                HStack(spacing: 2) {
                    ForEach(0..<3, id: \.self) { i in
                        Image(systemName: i < stars ? "star.fill" : "star")
                            .font(.system(size: 12))
                            .foregroundStyle(DS.color(i < stars ? "ink" : "hairline"))
                    }
                }
            } else {
                Text(level.isBoss ? Copy.t("echo.boss") : " ").font(DS.font("footnote")).foregroundStyle(DS.color("muted"))
            }
        }

        if state == .locked {
            circle.accessibilityLabel(Copy.t("echo.locked"))
        } else {
            NavigationLink {
                EchoPlayView(startLevel: level.number)
            } label: { circle }
            .buttonStyle(.plain)
            .accessibilityLabel(Copy.t("echo.level", ["level": level.number]))
            .accessibilityIdentifier("echo-node-\(level.number)")
        }
    }
}

// MARK: - E2 Echo play + E3 Echo result

struct EchoPlayView: View {
    let startLevel: Int
    @EnvironmentObject private var store: ProgressStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var m = EchoModel()

    var body: some View {
        GameScreen(model: m, showInput: m.phase == .watch || m.phase == .input) {
            switch m.phase {
            case .intro: intro
            case .watch, .input: playing
            case .cleared, .failed: result
            }
        }
        .background(DS.color("bg"))
        .navigationTitle(Copy.t("echo.level", ["level": m.level.number]))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if m.items.isEmpty && m.phase == .intro { m.prepare(store, level: startLevel) } }
    }

    // Intro card before a level starts.
    private var intro: some View {
        VStack(alignment: .leading, spacing: DS.space("sm")) {
            Text(m.level.isBoss ? Copy.t("echo.boss") : Copy.t("echo.stages.\(m.level.stage.rawValue)")).eyebrowStyle()
            Text(Copy.t("echo.level", ["level": m.level.number])).font(DS.font("largeTitle")).foregroundStyle(DS.color("ink"))
            Text(m.level.introText).font(DS.font("body")).foregroundStyle(DS.color("muted"))
            PrimaryButton(title: Copy.t("echo.start")) { m.begin() }
                .padding(.top, DS.space("md"))
                .accessibilityIdentifier("echo-start")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var playing: some View {
        VStack(spacing: DS.space("md")) {
            HStack {
                HStack(spacing: DS.space("xxs")) {
                    ForEach(0..<3, id: \.self) { i in
                        Image(systemName: i < m.hearts ? "heart.fill" : "heart")
                            .foregroundStyle(DS.color(i < m.hearts ? "ink" : "hairline"))
                    }
                }
                .accessibilityLabel("\(Copy.t("echo.hearts")): \(m.hearts)")
                Spacer()
                Text(Copy.t("echo.round", ["n": m.round, "total": m.level.rounds]))
                    .font(DS.font("footnote").monospacedDigit()).foregroundStyle(DS.color("muted"))
            }
            ProgressView(value: Double(m.round - 1) + (m.targets.isEmpty ? 0 : Double(m.entered) / Double(m.targets.count)),
                         total: Double(m.level.rounds))
                .tint(DS.color("accent"))

            if m.phase == .watch {
                Text(Copy.t("echo.watch")).eyebrowStyle()
                ZStack {
                    if let i = m.shownIndex, i < m.items.count {
                        Text(m.items[i])
                            .font(DS.font("display"))
                            .tracking(m.level.usesWords ? 2.5 : 0)
                            .foregroundStyle(DS.color("ink"))
                            .transition(.opacity)
                            .id("\(m.round)-\(i)-\(m.items[i])")
                    }
                }
                .frame(height: 96)
                .animation(.easeOut(duration: 0.2), value: m.shownIndex)
                .accessibilityIdentifier("echo-shown")
            } else {
                Text(Copy.t("echo.yourTurn")).eyebrowStyle()
                slots
                    .frame(minHeight: 96)
                Text(Copy.t("echo.signLetter", ["n": min(m.entered + 1, m.targets.count), "total": m.targets.count]))
                    .font(DS.font("footnote")).foregroundStyle(DS.color("muted"))
            }

            Text(m.note ?? " ").font(DS.font("subhead")).foregroundStyle(DS.color("muted")).frame(height: 20)

            Button(Copy.t("echo.showAgain")) { m.showAgain() }
                .font(DS.font("headline"))
                .foregroundStyle(DS.color(m.showAgainUsed || m.phase != .input ? "muted" : "accent"))
                .disabled(m.showAgainUsed || m.phase != .input)
                .frame(minHeight: DS.size("minTap"))
        }
    }

    /// One slot per letter, grouped by word: done = ink, current = accent outline, upcoming = surface.
    private var slots: some View {
        // Words get a row each; a letter run is one row.
        let groups = m.level.usesWords ? m.items.map { $0.map { String($0) } } : [m.targets]
        var offset = 0
        let starts: [Int] = groups.map { g in defer { offset += g.count }; return offset }
        return VStack(spacing: DS.space("xs")) {
            ForEach(Array(groups.enumerated()), id: \.offset) { gi, group in
                HStack(spacing: DS.space("xxs")) {
                    ForEach(Array(group.enumerated()), id: \.offset) { li, letter in
                        let index = starts[gi] + li
                        ZStack {
                            RoundedRectangle(cornerRadius: DS.radius("sm"))
                                .fill(DS.color("surface"))
                            RoundedRectangle(cornerRadius: DS.radius("sm"))
                                .strokeBorder(index == m.entered ? DS.color("accent") : .clear, lineWidth: 2)
                            Text(index < m.entered ? letter : " ")
                                .font(DS.font("title2"))
                                .foregroundStyle(DS.color("ink"))
                        }
                        .frame(width: 40, height: 48)
                    }
                }
            }
        }
        .accessibilityIdentifier("echo-slots")
    }

    private var result: some View {
        let cleared = m.phase == .cleared
        return VStack(alignment: .leading, spacing: DS.space("sm")) {
            Text(cleared ? Copy.t("echo.cleared") : Copy.t("echo.failed")).eyebrowStyle()
            Text(Copy.t("echo.level", ["level": m.level.number])).font(DS.font("largeTitle")).foregroundStyle(DS.color("ink"))
            if cleared {
                HStack(spacing: DS.space("xs")) {
                    ForEach(0..<3, id: \.self) { i in
                        Image(systemName: i < m.stars ? "star.fill" : "star")
                            .font(.system(size: 34))
                            .foregroundStyle(DS.color(i < m.stars ? "ink" : "hairline"))
                    }
                }
                .accessibilityLabel("\(m.stars) / 3")
                .accessibilityIdentifier("echo-stars")
                HStack(spacing: DS.space("lg")) {
                    EchoStat(value: "\(m.hearts)", label: Copy.t("echo.heartsLeft"))
                    EchoStat(value: m.showAgainUsed ? Copy.t("echo.yes") : Copy.t("echo.no"), label: Copy.t("echo.shownAgain"))
                }
                .padding(.top, DS.space("xs"))
                PrimaryButton(title: Copy.t("echo.next")) { m.prepare(store, level: m.level.number + 1) }
                    .padding(.top, DS.space("md"))
                    .accessibilityIdentifier("echo-next")
                TextButton(title: Copy.t("echo.replay")) { m.prepare(store, level: m.level.number) }
            } else {
                Text(Copy.t("echo.failedBody", ["sequence": m.items.joined(separator: " ")]))
                    .font(DS.font("body")).foregroundStyle(DS.color("muted"))
                PrimaryButton(title: Copy.t("echo.retry")) { m.prepare(store, level: m.level.number) }
                    .padding(.top, DS.space("md"))
                    .accessibilityIdentifier("echo-retry")
            }
            TextButton(title: Copy.t("echo.map")) { dismiss() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Contract buttons (DESIGN.md §5)

struct PrimaryButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(DS.font("headline"))
                .foregroundStyle(DS.color("accentInk"))
                .frame(maxWidth: .infinity, minHeight: DS.size("button"))
                .background(DS.color("accent"), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct TextButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(title, action: action)
            .font(DS.font("headline"))
            .foregroundStyle(DS.color("accent"))
            .frame(minHeight: DS.size("minTap"))
    }
}
