import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack(alignment: .top) {
                        SectionHeading(
                            "Sholem aleykhem",
                            eyebrow: "Your Yiddish today",
                            subtitle: "A few spoken phrases at a time—always in Latin letters."
                        )
                        Spacer(minLength: 20)
                        ProgressRing(progress: model.overallProgress)
                    }

                    HStack(spacing: 10) {
                        PersonalMetric(
                            value: "\(model.currentStreak)",
                            label: model.currentStreak == 1 ? "day" : "days",
                            symbol: "flame.fill",
                            color: AppTheme.clay
                        )
                        PersonalMetric(
                            value: "\(model.totalXP)",
                            label: "total XP",
                            symbol: "star.fill",
                            color: AppTheme.honey
                        )
                        PersonalMetric(
                            value: "\(model.dailyXP)/\(model.dailyGoal)",
                            label: "today",
                            symbol: "scope",
                            color: AppTheme.sage
                        )
                    }

                    if let nextLesson = model.nextUnlearnedLesson {
                        continueCard(nextLesson)
                    } else {
                        completedCourseCard
                    }

                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: 20) {
                            heritageCard
                            reviewCard
                        }
                        VStack(spacing: 20) {
                            heritageCard
                            reviewCard
                        }
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "info.circle.fill")
                            .foregroundStyle(AppTheme.blue)
                        Text("The Listen button uses an approximate phonetic voice for now. Human Bessarabia–Odessa recordings can plug into the same phrase cards later.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.secondaryInk)
                    }
                    .padding(.horizontal, 4)
                }
                .padding(26)
                .frame(maxWidth: 980)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Home")
    }

    private func continueCard(_ lesson: Lesson) -> some View {
        NavigationLink {
            LessonSessionView(lesson: lesson)
        } label: {
            HStack(spacing: 22) {
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.white.opacity(0.17))
                    Image(systemName: lesson.symbol)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(.white)
                }
                .frame(width: 82, height: 82)

                VStack(alignment: .leading, spacing: 7) {
                    Text("TODAY · LESSON \(lesson.number)")
                        .font(.caption.weight(.bold))
                        .tracking(1.1)
                        .foregroundStyle(.white.opacity(0.75))
                    Text(lesson.title)
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(.white)
                    Text(lesson.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(2)
                    Text(reason(for: lesson))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(2)
                        .padding(.top, 2)
                }

                Spacer(minLength: 10)

                VStack(spacing: 9) {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 32))
                    Text("\(lesson.minutes) min")
                        .font(.caption.weight(.semibold))
                }
                .foregroundStyle(.white)
            }
            .padding(22)
            .background(
                LinearGradient(
                    colors: [AppTheme.plum, AppTheme.beet],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 26, style: .continuous)
            )
            .shadow(color: AppTheme.plum.opacity(0.25), radius: 22, y: 12)
        }
        .buttonStyle(.plain)
    }

    private var completedCourseCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("First course complete", systemImage: "checkmark.seal.fill")
                .font(.title2.weight(.bold))
                .foregroundStyle(AppTheme.sage)
            Text("Keep the words alive in Review and add the expressions your own family used.")
                .foregroundStyle(AppTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(padding: 22)
    }

    private var heritageCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HeritageTag()
            Text("Built around your reason for learning")
                .font(.title3.weight(.bold))
                .foregroundStyle(AppTheme.ink)
            Text("Spoken family Yiddish from Bessarabia toward Odessa. No alphabet drills. Short sessions adapt to what you miss, and family words enter your own review deck.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                model.selectedSection = .family
            } label: {
                Label("Add a family word", systemImage: "plus.circle.fill")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.beet)
        }
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .cardSurface()
    }

    private var reviewCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "rectangle.stack.fill")
                    .foregroundStyle(AppTheme.blue)
                Text("Ready to review")
                    .font(.caption.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(AppTheme.blue)
            }
            Text("\(model.duePhrases.count) phrases")
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(AppTheme.ink)
            Text(model.learnedPhraseIDs.isEmpty ? "Learn your first phrase to begin a review deck." : "A quick round strengthens the words you have already met.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                model.selectedSection = model.learnedPhraseIDs.isEmpty ? .learn : .practice
            } label: {
                Label(model.learnedPhraseIDs.isEmpty ? "Open lessons" : "Start review", systemImage: "arrow.right")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.beet)
        }
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .cardSurface()
    }

    private func reason(for lesson: Lesson) -> String {
        switch lesson.id {
        case "sound-map":
            "Because you want speech without Hebrew-reading lessons, these seven Latin sound patterns are the shortest useful foundation."
        case "greetings":
            "Your first goal is a real exchange you could have heard around the family table."
        case "family-table":
            "These are the people and relationships at the center of the Yiddish you want back."
        case "kitchen":
            "Food words often preserve the most local Bessarabian household vocabulary."
        case "keep-talking":
            "These phrases help you ask for the exact family word instead of guessing it."
        case "warmth":
            "Rhythm and feeling carry as much family identity as dictionary meaning."
        case "family-story":
            "This turns vocabulary into the memories and sayings you actually came here to recover."
        default:
            "This is the next short step in your personal Bessarabia–Odessa path."
        }
    }
}

private struct PersonalMetric: View {
    let value: String
    let label: String
    let symbol: String
    let color: Color

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: symbol)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.ink)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(AppTheme.secondaryInk)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 13)
        .frame(maxWidth: .infinity, minHeight: 54)
        .background(.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .stroke(.white.opacity(0.82), lineWidth: 1)
        }
    }
}
