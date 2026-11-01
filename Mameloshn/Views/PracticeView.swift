import SwiftUI

struct PracticeView: View {
    @EnvironmentObject private var model: AppModel
    @State private var queue: [Phrase] = []
    @State private var revealed = false
    @State private var didFinishSession = false

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    SectionHeading(
                        "Review out loud",
                        eyebrow: "A little, often",
                        subtitle: "Listen, recall the meaning, then rate how easily it came back."
                    )

                    if model.learnedPhraseIDs.isEmpty {
                        EmptyCourseState(
                            symbol: "rectangle.stack.badge.plus",
                            title: "Your review deck is waiting",
                            detail: "Mark a phrase learned in any lesson and it will appear here.",
                            actionTitle: "Open the lessons"
                        ) {
                            model.selectedSection = .learn
                        }
                    } else if didFinishSession {
                        finishedCard
                    } else if let phrase = queue.first {
                        reviewCard(phrase)
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 380)
                    }
                }
                .padding(26)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Practice")
        .onAppear(perform: startSessionIfNeeded)
    }

    private func reviewCard(_ phrase: Phrase) -> some View {
        VStack(spacing: 22) {
            HStack {
                HeritageTag(text: "Card \(sessionPosition) of \(sessionTotal)")
                Spacer()
                AudioButton(phrase: phrase)
            }

            VStack(spacing: 12) {
                Text("SAY IT, THEN RECALL THE MEANING")
                    .font(.caption.weight(.bold))
                    .tracking(1.1)
                    .foregroundStyle(AppTheme.beet)
                Text(phrase.transliteration)
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.ink)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.7)

                if revealed {
                    VStack(spacing: 8) {
                        Text(phrase.meaning)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(AppTheme.secondaryInk)
                            .multilineTextAlignment(.center)
                        Text(phrase.pronunciation)
                            .font(.system(.headline, design: .rounded, weight: .semibold))
                            .foregroundStyle(AppTheme.plum)
                        Text(phrase.usage)
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.secondaryInk)
                            .multilineTextAlignment(.center)
                            .padding(.top, 6)
                    }
                    .transition(.opacity.combined(with: .scale(scale: 0.97)))
                } else {
                    Text("Tap reveal when you have an answer")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.secondaryInk.opacity(0.8))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 270)

            if revealed {
                VStack(spacing: 10) {
                    Text("HOW DID THAT FEEL?")
                        .font(.caption2.weight(.bold))
                        .tracking(1)
                        .foregroundStyle(AppTheme.secondaryInk)
                    HStack(spacing: 10) {
                        ratingButton("Again", symbol: "arrow.counterclockwise", color: AppTheme.beet, rating: .again)
                        ratingButton("Good", symbol: "hand.thumbsup.fill", color: AppTheme.blue, rating: .good)
                        ratingButton("Easy", symbol: "sparkles", color: AppTheme.sage, rating: .easy)
                    }
                }
            } else {
                Button {
                    withAnimation(.snappy) { revealed = true }
                } label: {
                    Text("Reveal meaning")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(AppTheme.beet, in: RoundedRectangle(cornerRadius: 17))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.space, modifiers: [])
            }
        }
        .cardSurface(padding: 24)
    }

    private var finishedCard: some View {
        VStack(spacing: 17) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.sage)
            Text("Review complete")
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(AppTheme.ink)
            Text("You brought \(sessionTotal) phrases back to mind. That small act of recall is what makes them stick.")
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.secondaryInk)
                .frame(maxWidth: 440)
            Button("Practice another round") {
                queue = Array(model.allPracticePhrases.filter { model.isLearned($0) }.shuffled().prefix(8))
                initialSessionCount = queue.count
                revealed = false
                didFinishSession = false
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity, minHeight: 390)
        .cardSurface(padding: 28)
    }

    @State private var initialSessionCount = 0

    private var sessionPosition: Int {
        max(1, initialSessionCount - queue.count + 1)
    }

    private var sessionTotal: Int {
        initialSessionCount
    }

    private func ratingButton(
        _ title: String,
        symbol: String,
        color: Color,
        rating: ReviewRating
    ) -> some View {
        Button {
            guard let phrase = queue.first else { return }
            model.rate(phrase, as: rating)
            withAnimation(.snappy) {
                queue.removeFirst()
                revealed = false
                if queue.isEmpty { didFinishSession = true }
            }
        } label: {
            VStack(spacing: 5) {
                Image(systemName: symbol)
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(color)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func startSessionIfNeeded() {
        guard queue.isEmpty, !didFinishSession, !model.learnedPhraseIDs.isEmpty else { return }
        let source = model.duePhrases.isEmpty
            ? model.allPracticePhrases.filter { model.isLearned($0) }
            : model.duePhrases
        queue = Array(source.shuffled().prefix(8))
        initialSessionCount = queue.count
    }
}
