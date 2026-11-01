import SwiftUI

struct ProgressRing: View {
    let progress: Double
    var size: CGFloat = 72
    var lineWidth: CGFloat = 8

    var body: some View {
        ZStack {
            Circle()
                .stroke(AppTheme.paperDeep, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.015, progress))
                .stroke(
                    AppTheme.beet,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            Text("\(Int(progress * 100))%")
                .font(.system(.subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(AppTheme.ink)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Int(progress * 100)) percent complete")
    }
}

struct SectionHeading: View {
    let eyebrow: String?
    let title: String
    let subtitle: String?

    init(_ title: String, eyebrow: String? = nil, subtitle: String? = nil) {
        self.eyebrow = eyebrow
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let eyebrow {
                Text(eyebrow.uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(AppTheme.beet)
            }
            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(AppTheme.ink)
            if let subtitle {
                Text(subtitle)
                    .font(.body)
                    .foregroundStyle(AppTheme.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct AudioButton: View {
    @EnvironmentObject private var speechCoach: SpeechCoach
    let phrase: Phrase
    var compact = false

    var body: some View {
        if phrase.canSpeak {
            Menu {
                Button {
                    speechCoach.speak(phrase)
                } label: {
                    Label("Play", systemImage: "speaker.wave.2.fill")
                }
                Button {
                    speechCoach.speak(phrase, slowly: true)
                } label: {
                    Label("Play slowly", systemImage: "tortoise.fill")
                }
            } label: {
                Label(
                    speechCoach.speakingPhraseID == phrase.id ? "Speaking" : (compact ? "Listen" : "Rough audio"),
                    systemImage: speechCoach.speakingPhraseID == phrase.id ? "waveform" : "speaker.wave.2.fill"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.beet)
                .padding(.horizontal, compact ? 10 : 13)
                .frame(height: 36)
                .background(AppTheme.beet.opacity(0.09), in: Capsule())
            }
            .menuStyle(.borderlessButton)
            .accessibilityHint("Offers normal and slow approximate pronunciation")
        }
    }
}

struct HeritageTag: View {
    var text = "Bessarabia–Odessa"

    var body: some View {
        Label(text, systemImage: "map.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(AppTheme.plum)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(AppTheme.plum.opacity(0.09), in: Capsule())
    }
}

struct EmptyCourseState: View {
    let symbol: String
    let title: String
    let detail: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(AppTheme.beet)
            Text(title)
                .font(.title2.weight(.bold))
                .foregroundStyle(AppTheme.ink)
            Text(detail)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.secondaryInk)
                .frame(maxWidth: 420)
            Button(actionTitle, action: action)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .frame(maxWidth: .infinity, minHeight: 380)
        .padding(30)
    }
}
