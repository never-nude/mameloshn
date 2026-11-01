import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        #if os(macOS)
        desktopLayout
            .sheet(isPresented: welcomeBinding) {
                WelcomeView()
                    .environmentObject(model)
                    .frame(minWidth: 620, minHeight: 620)
                    .interactiveDismissDisabled()
            }
        #else
        phoneLayout
            .fullScreenCover(isPresented: welcomeBinding) {
                WelcomeView()
                    .environmentObject(model)
                    .interactiveDismissDisabled()
            }
        #endif
    }

    private var welcomeBinding: Binding<Bool> {
        Binding(
            get: { !model.hasSeenWelcome },
            set: { _ in }
        )
    }

    #if os(macOS)
    private var desktopLayout: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 20) {
                MameloshnWordmark()
                    .padding(.horizontal, 12)
                    .padding(.top, 8)

                List(AppSection.allCases, selection: $model.selectedSection) { section in
                    Label(section.title, systemImage: section.symbol)
                        .font(.system(.body, design: .rounded, weight: .semibold))
                        .tag(section)
                }
                .listStyle(.sidebar)

                VStack(alignment: .leading, spacing: 6) {
                    Text("FAMILY ROOTS")
                        .font(.caption2.weight(.bold))
                        .tracking(1.1)
                        .foregroundStyle(AppTheme.beet)
                    Text(model.familyRoots.isEmpty ? "Bessarabia–Odessa" : model.familyRoots)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.ink)
                    Text("Southeastern Yiddish")
                        .font(.caption)
                        .foregroundStyle(AppTheme.secondaryInk)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.paperDeep.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
                .padding(12)
            }
            .navigationSplitViewColumnWidth(min: 220, ideal: 245, max: 280)
        } detail: {
            NavigationStack {
                selectedContent
            }
        }
        .navigationSplitViewStyle(.balanced)
    }
    #endif

    #if !os(macOS)
    private var phoneLayout: some View {
        TabView(selection: $model.selectedSection) {
            NavigationStack { HomeView() }
                .tabItem { Label(AppSection.home.title, systemImage: AppSection.home.symbol) }
                .tag(AppSection.home)

            NavigationStack { LearnView() }
                .tabItem { Label(AppSection.learn.title, systemImage: AppSection.learn.symbol) }
                .tag(AppSection.learn)

            NavigationStack { PracticeView() }
                .tabItem { Label(AppSection.practice.title, systemImage: AppSection.practice.symbol) }
                .tag(AppSection.practice)

            NavigationStack { PhrasebookView() }
                .tabItem { Label(AppSection.phrasebook.title, systemImage: AppSection.phrasebook.symbol) }
                .tag(AppSection.phrasebook)

            NavigationStack { FamilyNotebookView() }
                .tabItem { Label(AppSection.family.title, systemImage: AppSection.family.symbol) }
                .tag(AppSection.family)
        }
    }
    #endif

    @ViewBuilder
    private var selectedContent: some View {
        switch model.selectedSection {
        case .home: HomeView()
        case .learn: LearnView()
        case .practice: PracticeView()
        case .phrasebook: PhrasebookView()
        case .family: FamilyNotebookView()
        }
    }
}

private struct WelcomeView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    MameloshnWordmark()

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Listen for the Yiddish\nyour family remembers.")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundStyle(AppTheme.ink)
                            .fixedSize(horizontal: false, vertical: true)

                        Text("A speaking-first course for family roots from Bessarabia to Odessa, written entirely in Latin letters.")
                            .font(.title3)
                            .foregroundStyle(AppTheme.secondaryInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(spacing: 14) {
                        WelcomeFeature(
                            icon: "textformat.abc",
                            title: "No Hebrew alphabet",
                            detail: "Read a consistent Latin transliteration and an easy sound guide."
                        )
                        WelcomeFeature(
                            icon: "waveform",
                            title: "Bessarabia–Odessa aware",
                            detail: "Compare a stable dictionary form with Southeastern family pronunciation."
                        )
                        WelcomeFeature(
                            icon: "heart.text.clipboard",
                            title: "Your family gets the last word",
                            detail: "Save the exact words, vowels, places, and memories your relatives used."
                        )
                    }

                    Button {
                        model.hasSeenWelcome = true
                    } label: {
                        HStack {
                            Text("Begin with the family sounds")
                            Spacer()
                            Image(systemName: "arrow.right")
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .frame(height: 56)
                        .background(AppTheme.beet, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Closes the introduction and opens the course")
                }
                .padding(34)
                .frame(maxWidth: 660)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

private struct WelcomeFeature: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 15) {
            Image(systemName: icon)
                .font(.title3.weight(.bold))
                .foregroundStyle(AppTheme.beet)
                .frame(width: 42, height: 42)
                .background(AppTheme.beet.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(AppTheme.ink)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}
