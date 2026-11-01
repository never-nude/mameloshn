import SwiftUI

@main
struct MameloshnApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var speechCoach = SpeechCoach()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(speechCoach)
                .preferredColorScheme(.light)
                .tint(AppTheme.beet)
        }
        #if os(macOS)
        .defaultSize(width: 1120, height: 760)
        .windowResizability(.contentMinSize)
        #endif
    }
}
