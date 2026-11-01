import SwiftUI

struct PhrasebookView: View {
    @EnvironmentObject private var model: AppModel
    @State private var searchText = ""

    private var results: [(lesson: Lesson, phrase: Phrase)] {
        let all: [(lesson: Lesson, phrase: Phrase)] = model.lessons.flatMap { lesson in
            lesson.phrases.map { phrase in (lesson: lesson, phrase: phrase) }
        }
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return all
        }
        let query = searchText.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return all.filter { (item: (lesson: Lesson, phrase: Phrase)) -> Bool in
            let searchableText = "\(item.phrase.transliteration) \(item.phrase.meaning) \(item.phrase.pronunciation)"
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return searchableText.contains(query)
        }
    }

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    SectionHeading(
                        "Phrasebook",
                        eyebrow: "Latin letters only",
                        subtitle: "Search in English or Yiddish transliteration."
                    )

                    LazyVStack(spacing: 12) {
                        ForEach(results, id: \.phrase.id) { item in
                            PhrasebookRow(lesson: item.lesson, phrase: item.phrase)
                        }
                    }

                    if results.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "magnifyingglass")
                                .font(.largeTitle)
                                .foregroundStyle(AppTheme.secondaryInk)
                            Text("No phrase matches “\(searchText)”")
                                .font(.headline)
                                .foregroundStyle(AppTheme.ink)
                        }
                        .frame(maxWidth: .infinity, minHeight: 260)
                    }
                }
                .padding(26)
                .frame(maxWidth: 860)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Phrasebook")
        .searchable(text: $searchText, prompt: "water, goodbye, vaser…")
    }
}

private struct PhrasebookRow: View {
    @EnvironmentObject private var model: AppModel
    let lesson: Lesson
    let phrase: Phrase

    var body: some View {
        HStack(alignment: .center, spacing: 15) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(phrase.transliteration)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(AppTheme.ink)
                    Text("L\(lesson.number)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(AppTheme.color(for: lesson.tone))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(AppTheme.color(for: lesson.tone).opacity(0.1), in: Capsule())
                }
                Text(phrase.meaning)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.secondaryInk)
                Text(phrase.pronunciation)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.plum)
            }
            Spacer(minLength: 8)
            AudioButton(phrase: phrase, compact: true)
            Button {
                model.toggleLearned(phrase)
            } label: {
                Image(systemName: model.isLearned(phrase) ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(model.isLearned(phrase) ? AppTheme.sage : AppTheme.paperDeep)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.isLearned(phrase) ? "Remove phrase from Remember" : "Keep phrase in Remember")
        }
        .cardSurface(padding: 15)
    }
}
