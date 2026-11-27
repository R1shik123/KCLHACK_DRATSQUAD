import SwiftUI

// MARK: Play (home)

struct PlayView: View {
    @EnvironmentObject private var store: ProgressStore

    var body: some View {
        List {
            Section {
                HStack {
                    StatChip(label: "letters mastered", value: "\(store.mastered)/26")
                    StatChip(label: store.streak == 1 ? "day streak" : "days streak", value: "\(store.streak)")
                }
                Text(store.practisedToday ? "You practised today. Nice." : "Play a round to keep your streak going.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Games") {
                ForEach(GameKind.allCases) { game in
                    NavigationLink {
                        gameView(game)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(game.title).font(.headline)
                                Text(game.blurb).font(.caption).foregroundStyle(.secondary)
                                Text("Best: \(store.best(game))").font(.caption2).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: game.symbol)
                        }
                    }
                    .accessibilityIdentifier("game-\(game.rawValue)")
                }
            }
        }
        .navigationTitle("Signblast")
    }

    @ViewBuilder
    private func gameView(_ game: GameKind) -> some View {
        switch game {
        case .sprint: SprintView()
        case .spell: SpellView()
        case .echo: EchoView()
        case .mystery: MysteryView()
        }
    }
}

// MARK: Learn

struct LearnView: View {
    @EnvironmentObject private var store: ProgressStore

    var body: some View {
        List(Signs.all, id: \.self) { letter in
            NavigationLink {
                LetterCheckView(letter: letter)
            } label: {
                HStack(spacing: 14) {
                    Text(letter).font(.largeTitle.bold()).frame(width: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Signs.hints[letter] ?? "").font(.headline)
                        Text(store.box(letter) == 0 ? "New" : "Box \(store.box(letter)) of 5")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if !Signs.isSolid(letter) {
                        Text("Beta").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color.orange.opacity(0.2), in: Capsule())
                    }
                }
            }
        }
        .navigationTitle("Learn")
    }
}

/// Practise one letter with live feedback. A correct hold marks today as practised (no box change, like the web app).
struct LetterCheckView: View {
    let letter: String
    @EnvironmentObject private var hub: SignHub
    @EnvironmentObject private var store: ProgressStore
    @State private var lastSeen: String?
    @State private var passed = false
    @State private var passes = 0
    @State private var token: UUID?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Text(letter).font(.system(size: 90, weight: .bold, design: .rounded))
                Text(Signs.handshapes[letter] ?? "").multilineTextAlignment(.center)
                if !Signs.isSolid(letter) {
                    Text("Beta: the camera finds this letter harder to read.").font(.caption).foregroundStyle(.orange)
                }
                if !hub.usesPad {
                    CameraPanel(camera: hub.camera).frame(maxHeight: 280)
                }
                HStack {
                    Text("I see:")
                    Text(lastSeen ?? "–").font(.title.bold()).accessibilityIdentifier("check-seen")
                }
                if passed {
                    Label("Correct! Held long enough.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("check-pass")
                } else if let lastSeen, lastSeen != letter {
                    Text("That's \(lastSeen). Check the description and try again.").foregroundStyle(.red)
                }
                Text("Correct holds: \(passes)").font(.footnote).foregroundStyle(.secondary)
                Text(hub.statusText).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                if hub.usesPad {
                    LetterPad { hub.emit($0) }
                }
            }
            .padding()
        }
        .navigationTitle("Letter \(letter)")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            token = hub.attach { seen in
                lastSeen = seen
                if seen == letter {
                    passed = true
                    passes += 1
                    store.markToday()
                    Feedback.good()
                } else {
                    passed = false
                    Feedback.bad()
                }
            }
        }
        .onDisappear { hub.detach(token) }
    }
}

// MARK: Progress

struct StatsView: View {
    @EnvironmentObject private var store: ProgressStore

    var body: some View {
        List {
            Section {
                HStack {
                    StatChip(label: "Mastered", value: "\(store.mastered)/26")
                    StatChip(label: "Streak", value: "\(store.streak)d")
                }
                HStack {
                    StatChip(label: "Accuracy", value: store.accuracy.map { "\(Int($0 * 100))%" } ?? "–")
                    StatChip(label: "Avg time to sign", value: store.avgReactionMs.map { String(format: "%.1fs", $0 / 1000) } ?? "–")
                }
            }
            Section("Best scores") {
                ForEach(GameKind.allCases) { game in
                    LabeledContent(game.title, value: "\(store.best(game))")
                }
            }
            Section("Hardest letters") {
                if store.hardest.isEmpty {
                    Text("Play a few rounds to see which letters need work (3+ tries per letter).")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(store.hardest, id: \.letter) { row in
                        NavigationLink {
                            LetterCheckView(letter: row.letter)
                        } label: {
                            LabeledContent("Letter \(row.letter)", value: "\(Int(row.accuracy * 100))% hit")
                        }
                    }
                }
            }
            Section {
                ForEach(Signs.all, id: \.self) { letter in
                    let s = store.stat(letter)
                    HStack {
                        Text(letter).bold().frame(width: 24)
                        ProgressView(value: Double(store.box(letter)), total: 5)
                        Text(s.hits + s.misses > 0 ? "\(Int(100 * Double(s.hits) / Double(s.hits + s.misses)))%" : "–")
                            .font(.caption).foregroundStyle(.secondary).frame(width: 40, alignment: .trailing)
                    }
                }
            } header: {
                Text("Mastery by letter")
            } footer: {
                Text("Each bar is the letter's Leitner box (1–5). Signing it moves it up a box; missing it sends it back to 1. Box 4+ counts as mastered.")
            }
            Section("Recent rounds") {
                if store.data.history.isEmpty {
                    Text("No rounds yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(store.data.history.reversed().prefix(10)) { r in
                        LabeledContent("\(r.game.title) · \(r.date.formatted(date: .abbreviated, time: .shortened))", value: "\(r.score)")
                    }
                }
            }
        }
        .navigationTitle("Progress")
    }
}

// MARK: Settings

struct SettingsView: View {
    @EnvironmentObject private var hub: SignHub
    @EnvironmentObject private var store: ProgressStore
    @AppStorage("haptics") private var haptics = true
    @State private var confirmReset = false

    var body: some View {
        Form {
            Section {
                Picker("Sign with", selection: $hub.mode) {
                    ForEach(SignHub.Mode.allCases) { Text($0.label).tag($0) }
                }
                Picker("Hold time", selection: $hub.holdFrames) {
                    Text("Short").tag(5)
                    Text("Normal").tag(8)
                    Text("Long").tag(12)
                }
            } header: {
                Text("Input")
            } footer: {
                Text(hub.statusText)
            }
            Section("Feedback") {
                Toggle("Haptics", isOn: $haptics)
            }
            Section("Data") {
                Button("Reset progress", role: .destructive) { confirmReset = true }
            }
            Section("About") {
                Text("Signblast teaches the ASL fingerspelling alphabet with games. Hand tracking runs on this phone with Apple's Vision framework; video never leaves the device and progress is stored only on this phone. It complements Deaf-led teaching; it doesn't replace it.")
                    .font(.footnote)
            }
        }
        .navigationTitle("Settings")
        .alert("Reset all progress on this phone?", isPresented: $confirmReset) {
            Button("Reset progress", role: .destructive) { store.reset() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Scores, streak and letter boxes are deleted. This can't be undone.")
        }
    }
}
