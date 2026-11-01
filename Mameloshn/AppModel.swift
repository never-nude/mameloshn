import Combine
import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var selectedSection: AppSection = .home
    @Published var learnedPhraseIDs: Set<String> = [] {
        didSet { saveIfReady() }
    }
    @Published var reviewStates: [String: ReviewState] = [:] {
        didSet { saveIfReady() }
    }
    @Published var familyPhrases: [FamilyPhrase] = [] {
        didSet { saveIfReady() }
    }
    @Published var familyRoots = "Bessarabia–Odessa" {
        didSet { saveIfReady() }
    }
    @Published var hasSeenWelcome = false {
        didSet { saveIfReady() }
    }
    let lessons = Curriculum.lessons

    private let storageKey = "mameloshn.learning-state.v1"
    private var isRestoring = true

    init() {
        restore()
        isRestoring = false
    }

    var allPhrases: [Phrase] {
        lessons.flatMap(\.phrases)
    }

    var allPracticePhrases: [Phrase] {
        allPhrases + familyPhrases.map(\.practicePhrase)
    }

    var duePhrases: [Phrase] {
        let now = Date()
        let learned = allPracticePhrases.filter { learnedPhraseIDs.contains($0.id) }
        let due = learned.filter { phrase in
            reviewStates[phrase.id]?.dueAt ?? .distantPast <= now
        }
        if !due.isEmpty { return due }
        return Array(learned.prefix(8))
    }

    var nextUnlearnedLesson: Lesson? {
        lessons.first { progress(for: $0) < 1 }
    }

    func progress(for lesson: Lesson) -> Double {
        guard !lesson.phrases.isEmpty else { return 0 }
        let learnedCount = lesson.phrases.filter { learnedPhraseIDs.contains($0.id) }.count
        return Double(learnedCount) / Double(lesson.phrases.count)
    }

    func isLearned(_ phrase: Phrase) -> Bool {
        learnedPhraseIDs.contains(phrase.id)
    }

    func toggleLearned(_ phrase: Phrase) {
        if learnedPhraseIDs.contains(phrase.id) {
            learnedPhraseIDs.remove(phrase.id)
            reviewStates.removeValue(forKey: phrase.id)
        } else {
            learnedPhraseIDs.insert(phrase.id)
            reviewStates[phrase.id] = ReviewState(level: 0, dueAt: Date())
        }
    }

    func markLessonComplete(_ lesson: Lesson, missedPhraseIDs: Set<String> = []) {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()

        for phrase in lesson.phrases {
            learnedPhraseIDs.insert(phrase.id)
            if missedPhraseIDs.contains(phrase.id) {
                reviewStates[phrase.id] = ReviewState(level: 0, dueAt: Date())
            } else if reviewStates[phrase.id] == nil {
                reviewStates[phrase.id] = ReviewState(level: 1, dueAt: tomorrow)
            }
        }
    }

    func rate(_ phrase: Phrase, as rating: ReviewRating) {
        learnedPhraseIDs.insert(phrase.id)
        var state = reviewStates[phrase.id] ?? ReviewState(level: 0, dueAt: Date())

        switch rating {
        case .again:
            state.level = 0
            state.dueAt = Calendar.current.date(byAdding: .minute, value: 10, to: Date()) ?? Date()
        case .good:
            state.level = min(state.level + 1, 5)
            state.dueAt = dueDate(for: state.level)
        case .easy:
            state.level = min(state.level + 2, 5)
            state.dueAt = dueDate(for: state.level)
        }

        reviewStates[phrase.id] = state
    }

    func addFamilyPhrase(_ phrase: FamilyPhrase) {
        familyPhrases.insert(phrase, at: 0)
        let practicePhrase = phrase.practicePhrase
        learnedPhraseIDs.insert(practicePhrase.id)
        reviewStates[practicePhrase.id] = ReviewState(level: 0, dueAt: Date())
    }

    func deleteFamilyPhrases(at offsets: IndexSet) {
        for offset in offsets {
            let phraseID = familyPhrases[offset].practicePhrase.id
            learnedPhraseIDs.remove(phraseID)
            reviewStates.removeValue(forKey: phraseID)
        }
        familyPhrases.remove(atOffsets: offsets)
    }

    private func dueDate(for level: Int) -> Date {
        let dayIntervals = [0, 1, 3, 7, 14, 30]
        let days = dayIntervals[min(max(level, 0), dayIntervals.count - 1)]
        return Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
    }

    private func restore() {
        guard
            let data = UserDefaults.standard.data(forKey: storageKey),
            let state = try? JSONDecoder().decode(StoredLearningState.self, from: data)
        else { return }

        learnedPhraseIDs = state.learnedPhraseIDs
        reviewStates = state.reviewStates
        familyPhrases = state.familyPhrases
        familyRoots = state.familyRoots
        hasSeenWelcome = state.hasSeenWelcome
    }

    private func saveIfReady() {
        guard !isRestoring else { return }
        let state = StoredLearningState(
            learnedPhraseIDs: learnedPhraseIDs,
            reviewStates: reviewStates,
            familyPhrases: familyPhrases,
            familyRoots: familyRoots,
            hasSeenWelcome: hasSeenWelcome
        )
        guard let data = try? JSONEncoder().encode(state) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
