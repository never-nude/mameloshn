import Foundation

enum AppSection: String, CaseIterable, Identifiable {
    case home
    case learn
    case practice
    case phrasebook
    case family

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .learn: "Learn"
        case .practice: "Practice"
        case .phrasebook: "Phrasebook"
        case .family: "Family words"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .learn: "books.vertical.fill"
        case .practice: "rectangle.stack.fill"
        case .phrasebook: "text.book.closed.fill"
        case .family: "heart.text.clipboard.fill"
        }
    }
}

enum LessonTone: String, Codable, Hashable {
    case plum
    case beet
    case honey
    case sage
    case blue
    case clay
}

struct DialectVariant: Identifiable, Hashable, Codable {
    let id: String
    let label: String
    let transliteration: String
    let pronunciation: String
    let note: String
}

struct Phrase: Identifiable, Hashable, Codable {
    let id: String
    let transliteration: String
    let meaning: String
    let pronunciation: String
    let speechCue: String
    let usage: String
    let variants: [DialectVariant]
    let canSpeak: Bool

    init(
        id: String,
        transliteration: String,
        meaning: String,
        pronunciation: String,
        speechCue: String? = nil,
        usage: String,
        variants: [DialectVariant] = [],
        canSpeak: Bool = true
    ) {
        self.id = id
        self.transliteration = transliteration
        self.meaning = meaning
        self.pronunciation = pronunciation
        self.speechCue = speechCue ?? pronunciation
        self.usage = usage
        self.variants = variants
        self.canSpeak = canSpeak
    }
}

struct Lesson: Identifiable, Hashable {
    let id: String
    let number: Int
    let title: String
    let subtitle: String
    let symbol: String
    let tone: LessonTone
    let minutes: Int
    let dialectNote: String
    let phrases: [Phrase]
}

struct ReviewState: Codable, Hashable {
    var level: Int
    var dueAt: Date
}

enum ReviewRating {
    case again
    case good
    case easy
}

struct FamilyPhrase: Identifiable, Codable, Hashable {
    var id = UUID()
    var transliteration: String
    var meaning: String
    var pronunciation: String
    var memory: String
    var place: String
    var createdAt = Date()

    var practicePhrase: Phrase {
        Phrase(
            id: "family-\(id.uuidString)",
            transliteration: transliteration,
            meaning: meaning,
            pronunciation: pronunciation.isEmpty ? transliteration : pronunciation,
            speechCue: pronunciation.isEmpty ? transliteration : pronunciation,
            usage: memory.isEmpty ? "A word from your own family." : memory
        )
    }
}

struct StoredLearningState: Codable {
    var learnedPhraseIDs: Set<String> = []
    var reviewStates: [String: ReviewState] = [:]
    var familyPhrases: [FamilyPhrase] = []
    var familyRoots = "Bessarabia–Odessa"
    var hasSeenWelcome = false
    var totalXP: Int?
    var dailyXP: Int?
    var currentStreak: Int?
    var lastActiveDay: Date?
}
