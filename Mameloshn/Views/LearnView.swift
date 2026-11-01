import SwiftUI

struct LearnView: View {
    @EnvironmentObject private var model: AppModel

    private let columns = [
        GridItem(.adaptive(minimum: 260, maximum: 420), spacing: 18)
    ]

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    SectionHeading(
                        "A path back to the family voice",
                        eyebrow: "Words as a living thread",
                        subtitle: "Move through short lessons in Latin letters, carrying each word into memory and family conversation."
                    )

                    LazyVGrid(columns: columns, alignment: .leading, spacing: 18) {
                        ForEach(model.lessons) { lesson in
                            NavigationLink {
                                LessonDetailView(lesson: lesson)
                            } label: {
                                LessonTile(lesson: lesson, progress: model.progress(for: lesson))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(26)
                .frame(maxWidth: 1040)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Learn")
    }
}

private struct LessonTile: View {
    let lesson: Lesson
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .fill(AppTheme.color(for: lesson.tone).opacity(0.12))
                    Image(systemName: lesson.symbol)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(AppTheme.color(for: lesson.tone))
                }
                .frame(width: 52, height: 52)

                Spacer()

                Text("\(lesson.minutes) MIN")
                    .font(.caption2.weight(.bold))
                    .tracking(0.9)
                    .foregroundStyle(AppTheme.secondaryInk)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("LESSON \(lesson.number)")
                    .font(.caption2.weight(.bold))
                    .tracking(1)
                    .foregroundStyle(AppTheme.color(for: lesson.tone))
                Text(lesson.title)
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.ink)
                Text(lesson.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.secondaryInk)
                    .lineLimit(2)
                    .frame(minHeight: 38, alignment: .top)
            }

            VStack(spacing: 7) {
                ProgressView(value: progress)
                    .tint(AppTheme.color(for: lesson.tone))
                HStack {
                    Text(progress == 1 ? "Held in memory" : (progress > 0 ? "Continue the thread" : "Begin here"))
                    Spacer()
                    Image(systemName: progress == 1 ? "checkmark.circle.fill" : "arrow.right")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(progress == 1 ? AppTheme.sage : AppTheme.secondaryInk)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading)
        .cardSurface()
    }
}

struct LessonDetailView: View {
    @EnvironmentObject private var model: AppModel
    let lesson: Lesson

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    lessonHeader

                    NavigationLink {
                        LessonSessionView(lesson: lesson)
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "play.fill")
                                .font(.headline)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Start the lesson")
                                    .font(.headline)
                                Text("One phrase at a time · about \(lesson.minutes) minutes")
                                    .font(.caption)
                                    .opacity(0.82)
                            }
                            Spacer()
                            Image(systemName: "arrow.right")
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .frame(maxWidth: .infinity, minHeight: 62)
                        .background(AppTheme.color(for: lesson.tone), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "map.fill")
                            .foregroundStyle(AppTheme.plum)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("BESSARABIA–ODESSA NOTE")
                                .font(.caption2.weight(.bold))
                                .tracking(1)
                                .foregroundStyle(AppTheme.plum)
                            Text(lesson.dialectNote)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.secondaryInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface(padding: 16)

                    Text("PHRASES TO CARRY")
                        .font(.caption.weight(.bold))
                        .tracking(1.1)
                        .foregroundStyle(AppTheme.secondaryInk)

                    VStack(spacing: 14) {
                        ForEach(lesson.phrases) { phrase in
                            PhraseLearningCard(phrase: phrase)
                        }
                    }

                    Button {
                        model.markLessonComplete(lesson)
                    } label: {
                        Label(
                            model.progress(for: lesson) == 1 ? "Words added to Remember" : "Keep these words in Remember",
                            systemImage: model.progress(for: lesson) == 1 ? "checkmark.circle.fill" : "checkmark.circle"
                        )
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(AppTheme.beet, in: RoundedRectangle(cornerRadius: 17))
                    }
                    .buttonStyle(.plain)
                    .disabled(model.progress(for: lesson) == 1)
                    .opacity(model.progress(for: lesson) == 1 ? 0.65 : 1)
                }
                .padding(26)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(lesson.title)
    }

    private var lessonHeader: some View {
        HStack(alignment: .top, spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(AppTheme.color(for: lesson.tone))
                Image(systemName: lesson.symbol)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 70, height: 70)

            VStack(alignment: .leading, spacing: 6) {
                Text("LESSON \(lesson.number) · \(lesson.minutes) MIN")
                    .font(.caption.weight(.bold))
                    .tracking(1)
                    .foregroundStyle(AppTheme.color(for: lesson.tone))
                Text(lesson.title)
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.ink)
                Text(lesson.subtitle)
                    .foregroundStyle(AppTheme.secondaryInk)
            }
            Spacer(minLength: 0)
        }
    }
}

private struct PhraseLearningCard: View {
    @EnvironmentObject private var model: AppModel
    let phrase: Phrase
    @State private var showDetail = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(phrase.transliteration)
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(AppTheme.ink)
                    Text(phrase.meaning)
                        .font(.body)
                        .foregroundStyle(AppTheme.secondaryInk)
                }
                Spacer(minLength: 8)
                AudioButton(phrase: phrase, compact: true)
                Button {
                    model.toggleLearned(phrase)
                } label: {
                    Image(systemName: model.isLearned(phrase) ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(model.isLearned(phrase) ? AppTheme.sage : AppTheme.paperDeep)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(model.isLearned(phrase) ? "Remove phrase from Remember" : "Keep phrase in Remember")
            }

            Divider().opacity(0.55)

            Button {
                withAnimation(.snappy) { showDetail.toggle() }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("SAY IT LIKE")
                            .font(.caption2.weight(.bold))
                            .tracking(0.9)
                            .foregroundStyle(AppTheme.beet)
                        Text(phrase.pronunciation)
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .foregroundStyle(AppTheme.ink)
                    }
                    Spacer()
                    Image(systemName: showDetail ? "chevron.up" : "chevron.down")
                        .foregroundStyle(AppTheme.secondaryInk)
                }
            }
            .buttonStyle(.plain)

            if showDetail {
                VStack(alignment: .leading, spacing: 12) {
                    Text(phrase.usage)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.secondaryInk)

                    ForEach(phrase.variants) { variant in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(variant.label.uppercased())
                                .font(.caption2.weight(.bold))
                                .tracking(0.8)
                                .foregroundStyle(AppTheme.plum)
                            Text(variant.transliteration)
                                .font(.headline)
                                .foregroundStyle(AppTheme.ink)
                            Text("\(variant.pronunciation) · \(variant.note)")
                                .font(.caption)
                                .foregroundStyle(AppTheme.secondaryInk)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.plum.opacity(0.06), in: RoundedRectangle(cornerRadius: 13))
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .cardSurface(padding: 17)
    }
}
