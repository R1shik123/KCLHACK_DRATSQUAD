import SwiftUI

@main
struct SignblastApp: App {
    @StateObject private var store = ProgressStore()
    @StateObject private var hub = SignHub()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(hub)
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            NavigationStack { PlayView() }
                .tabItem { Label("Play", systemImage: "gamecontroller") }
            NavigationStack { LearnView() }
                .tabItem { Label("Learn", systemImage: "hand.raised") }
            NavigationStack { StatsView() }
                .tabItem { Label("Progress", systemImage: "chart.bar") }
            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
