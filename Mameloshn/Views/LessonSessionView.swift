import Foundation
import SwiftUI

struct LessonSessionView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var speechCoach: SpeechCoach

    @State private var sessionLesson: Lesson
    @State private var challengeIndex = 0
    @State private var selectedAnswer: String?
    @State private var hasListened = false
    @State private var correctAnswers = 0
    @State private var earnedXP = 0
    @State private var missedPhraseIDs: Set<String> = []
    @State private var isComplete = false

    private let pointsPerAnswer = 10
    private let completionBonus = 20

    init(lesson: Lesson) {
        _sessionLesson = State(initialValue: lesson)
    }

    var body: some View {
        ZStack {
            PaperBackground()

            if sessionLesson.phrases.isEmpty {
                emptyLesson
            } else if isComplete {
                LessonCelebrationView(
                    lesson: sessionLesson,
                    earnedXP: earnedXP,
                    correctAnswers: correctAnswers,
                    dismiss: dismiss.callAsFunction
                )
                .transition(.scale(scale: 0.94).combined(with: .opacity))
            } else {
                challengeFlow
                    .transition(.opacity)
            }
        }
        .navigationTitle("Lesson \(sessionLesson.number)")
    }

    private var challengeFlow: some View {
        VStack(spacing: 0) {
            sessionHeader

            ScrollView {
                VStack(spacing: 22) {
                    promptCard
                    answerChoices

                    if let selectedAnswer {
                        feedbackCard(for: selectedAnswer)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 28)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var sessionHeader: some View {
        VStack(spacing: 10) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(sessionLesson.title)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(AppTheme.ink)
                        .lineLimit(1)
                    Text("\(heritageTrack.uppercased()) · WORD \(challengeIndex + 1) OF \(sessionLesson.phrases.count)")
                        .font(.caption2.weight(.bold))
                        .tracking(0.9)
                        .foregroundStyle(AppTheme.secondaryInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)
                }

                Spacer(minLength: 12)

                Label("\(earnedXP) XP", systemImage: "star.fill")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.plum)
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .background(AppTheme.honey.opacity(0.22), in: Capsule())
                    .accessibilityLabel("\(earnedXP) experience points earned")
            }

            ProgressView(value: progress)
                .tint(lessonColor)
                .scaleEffect(y: 1.7)
                .accessibilityLabel("Lesson progress")
                .accessibilityValue("\(Int(progress * 100)) percent")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(.white.opacity(0.58))
        .overlay(alignment: .bottom) {
            Divider().opacity(0.35)
        }
    }

    private var promptCard: some View {
        VStack(spacing: 18) {
            HStack {
                Label(currentMode.label, systemImage: currentMode.symbol)
                    .font(.caption.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(lessonColor)
                Spacer()
                Image(systemName: sessionLesson.symbol)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(lessonColor)
                    .frame(width: 36, height: 36)
                    .background(lessonColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 11))
            }

            challengePrompt
                .frame(maxWidth: .infinity, minHeight: 104)

            if showsListenButton {
                Button {
                    hasListened = true
                    speechCoach.speak(currentPhrase)
                } label: {
                    Label(
                        speechCoach.speakingPhraseID == currentPhrase.id
                            ? "Playing…"
                            : (currentMode == .listenForMeaning ? "Play phrase" : "Listen"),
                        systemImage: speechCoach.speakingPhraseID == currentPhrase.id
                            ? "waveform"
                            : "speaker.wave.2.fill"
                    )
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .frame(minWidth: 150, minHeight: 48)
                    .background(lessonColor, in: Capsule())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button {
                        hasListened = true
                        speechCoach.speak(currentPhrase, slowly: true)
                    } label: {
                        Label("Play slowly", systemImage: "tortoise.fill")
                    }
                }
                .accessibilityHint("Plays an approximate pronunciation. Open the menu to play slowly.")
            }
        }
        .cardSurface(padding: 20)
    }

    @ViewBuilder
    private var challengePrompt: some View {
        switch currentMode {
        case .readForMeaning:
            VStack(spacing: 9) {
                Text("What does this phrase mean?")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.secondaryInk)
                Text(currentPhrase.transliteration)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.ink)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.72)
                Text(currentPhrase.pronunciation)
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(AppTheme.secondaryInk)
                    .multilineTextAlignment(.center)
            }

        case .recallYiddish:
            VStack(spacing: 9) {
                Text("How would you say this?")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.secondaryInk)
                Text(currentPhrase.meaning)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.ink)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.72)
                Text("Choose the Latin-letter Yiddish used in this course.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.secondaryInk)
                    .multilineTextAlignment(.center)
            }

        case .listenForMeaning:
            VStack(spacing: 11) {
                Image(systemName: hasListened ? "waveform.circle.fill" : "ear.fill")
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(lessonColor)
                Text(hasListened ? "Now choose what you heard." : "Listen before you answer.")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.ink)
                    .multilineTextAlignment(.center)
                Text("The written phrase appears after your answer.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.secondaryInk)
            }
        }
    }

    private var answerChoices: some View {
        VStack(spacing: 12) {
            if currentMode == .listenForMeaning && !hasListened {
                Text("Play the phrase to unlock the choices")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.secondaryInk)
            }

            ForEach(Array(answerOptions.enumerated()), id: \.element) { index, option in
                LessonAnswerChoice(
                    index: index,
                    text: option,
                    state: choiceState(for: option),
                    accent: lessonColor
                ) {
                    choose(option)
                }
                .disabled(answersAreLocked)
            }
        }
        .opacity(currentMode == .listenForMeaning && !hasListened ? 0.58 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Answer choices")
    }

    private func feedbackCard(for selection: String) -> some View {
        let wasCorrect = selection == correctAnswer
        let feedbackColor = wasCorrect ? AppTheme.sage : AppTheme.beet

        return VStack(alignment: .leading, spacing: 15) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: wasCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(feedbackColor)

                VStack(alignment: .leading, spacing: 5) {
                    Text(wasCorrect ? "You got it." : "Not this one.")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(AppTheme.ink)

                    if wasCorrect {
                        Text("\(answerExplanation) · +\(pointsPerAnswer) XP")
                            .foregroundStyle(AppTheme.secondaryInk)
                    } else {
                        Text(answerExplanation)
                            .foregroundStyle(AppTheme.secondaryInk)
                    }

                    Text("Say it like: \(currentPhrase.pronunciation)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(feedbackColor)
                }
                Spacer(minLength: 0)
            }

            Button {
                advance()
            } label: {
                HStack {
                    Text(isLastChallenge ? "Finish lesson" : "Continue")
                    Spacer()
                    Image(systemName: isLastChallenge ? "sparkles" : "arrow.right")
                }
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(feedbackColor, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.defaultAction)
        }
        .padding(18)
        .background(feedbackColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(feedbackColor.opacity(0.24), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }

    private var emptyLesson: some View {
        EmptyCourseState(
            symbol: "text.badge.xmark",
            title: "No words here yet",
            detail: "This lesson is still being prepared.",
            actionTitle: "Back to lessons",
            action: dismiss.callAsFunction
        )
    }

    private var currentPhrase: Phrase {
        sessionLesson.phrases[min(challengeIndex, sessionLesson.phrases.count - 1)]
    }

    private var lessonColor: Color {
        AppTheme.color(for: sessionLesson.tone)
    }

    private var heritageTrack: String {
        let roots = model.familyRoots.trimmingCharacters(in: .whitespacesAndNewlines)
        return roots.isEmpty ? "Bessarabia–Odessa" : roots
    }

    private var currentMode: LessonChallengeMode {
        switch challengeIndex % 3 {
        case 1 where currentPhrase.canSpeak: .listenForMeaning
        case 2: .recallYiddish
        default: .readForMeaning
        }
    }

    private var showsListenButton: Bool {
        currentPhrase.canSpeak && currentMode != .recallYiddish
    }

    private var answersAreLocked: Bool {
        selectedAnswer != nil || (currentMode == .listenForMeaning && !hasListened)
    }

    private var isLastChallenge: Bool {
        challengeIndex == sessionLesson.phrases.count - 1
    }

    private var progress: Double {
        let answered = challengeIndex + (selectedAnswer == nil ? 0 : 1)
        return Double(answered) / Double(sessionLesson.phrases.count)
    }

    private var correctAnswer: String {
        currentMode.answer(for: currentPhrase)
    }

    private var answerExplanation: String {
        switch currentMode {
        case .readForMeaning, .listenForMeaning:
            "\(currentPhrase.transliteration) means “\(currentPhrase.meaning)”"
        case .recallYiddish:
            "“\(currentPhrase.meaning)” is \(currentPhrase.transliteration)"
        }
    }

    private var answerOptions: [String] {
        let phrase = currentPhrase
        let correct = currentMode.answer(for: phrase)
        var seen = Set([correct.lowercased()])
        var distractors: [String] = []

        for candidate in sessionLesson.phrases + model.allPhrases where candidate.id != phrase.id {
            let answer = currentMode.answer(for: candidate)
            let key = answer.lowercased()
            if seen.insert(key).inserted {
                distractors.append(answer)
            }
        }

        let seed = phrase.id.unicodeScalars.reduce(currentMode.rawValue * 31) { $0 + Int($1.value) }
        if !distractors.isEmpty {
            let rotation = seed % distractors.count
            distractors = Array(distractors[rotation...] + distractors[..<rotation])
        }

        var options = Array(distractors.prefix(3))
        let insertionIndex = seed % (options.count + 1)
        options.insert(correct, at: insertionIndex)
        return options
    }

    private func choiceState(for option: String) -> LessonAnswerChoice.State {
        guard let selectedAnswer else { return .available }
        if option == correctAnswer { return .correct }
        if option == selectedAnswer { return .incorrect }
        return .dimmed
    }

    private func choose(_ option: String) {
        guard !answersAreLocked else { return }
        let isCorrect = option == correctAnswer

        withAnimation(.snappy(duration: 0.28)) {
            selectedAnswer = option
            if isCorrect {
                correctAnswers += 1
                earnedXP += pointsPerAnswer
            }
        }

        if isCorrect {
            model.awardXP(pointsPerAnswer)
        } else {
            missedPhraseIDs.insert(currentPhrase.id)
        }
    }

    private func advance() {
        guard selectedAnswer != nil else { return }
        speechCoach.stop()

        if isLastChallenge {
            finishLesson()
        } else {
            withAnimation(.snappy(duration: 0.34)) {
                challengeIndex += 1
                selectedAnswer = nil
                hasListened = false
            }
        }
    }

    private func finishLesson() {
        guard !isComplete else { return }
        model.markLessonComplete(sessionLesson, missedPhraseIDs: missedPhraseIDs)
        model.awardXP(completionBonus)

        withAnimation(.spring(response: 0.55, dampingFraction: 0.78)) {
            earnedXP += completionBonus
            isComplete = true
        }
    }
}

private enum LessonChallengeMode: Int {
    case readForMeaning
    case listenForMeaning
    case recallYiddish

    var label: String {
        switch self {
        case .readForMeaning: "READ · YIDDISH → ENGLISH"
        case .listenForMeaning: "LISTEN · AUDIO → ENGLISH"
        case .recallYiddish: "RECALL · ENGLISH → YIDDISH"
        }
    }

    var symbol: String {
        switch self {
        case .readForMeaning: "textformat.abc"
        case .listenForMeaning: "waveform"
        case .recallYiddish: "arrow.left.arrow.right"
        }
    }

    func answer(for phrase: Phrase) -> String {
        switch self {
        case .readForMeaning, .listenForMeaning: phrase.meaning
        case .recallYiddish: phrase.transliteration
        }
    }
}

private struct LessonAnswerChoice: View {
    enum State {
        case available
        case correct
        case incorrect
        case dimmed
    }

    let index: Int
    let text: String
    let state: State
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(badgeColor.opacity(state == .available ? 0.1 : 0.16))
                    if let resultSymbol {
                        Image(systemName: resultSymbol)
                            .font(.subheadline.weight(.bold))
                    } else {
                        Text(String(index + 1))
                            .font(.system(.subheadline, design: .rounded, weight: .bold))
                    }
                }
                .foregroundStyle(badgeColor)
                .frame(width: 38, height: 38)

                Text(text)
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(AppTheme.ink.opacity(state == .dimmed ? 0.52 : 1))
                    .multilineTextAlignment(.leading)

                Spacer(minLength: 8)
            }
            .padding(.horizontal, 15)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .background(backgroundColor, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                    .stroke(borderColor, lineWidth: state == .available || state == .dimmed ? 1 : 2)
            }
            .shadow(color: AppTheme.ink.opacity(state == .available ? 0.045 : 0), radius: 9, y: 4)
        }
        .buttonStyle(.plain)
        .opacity(state == .dimmed ? 0.72 : 1)
        .accessibilityLabel(accessibilityLabel)
    }

    private var badgeColor: Color {
        switch state {
        case .correct: AppTheme.sage
        case .incorrect: AppTheme.beet
        case .available, .dimmed: accent
        }
    }

    private var backgroundColor: Color {
        switch state {
        case .correct: AppTheme.sage.opacity(0.12)
        case .incorrect: AppTheme.beet.opacity(0.1)
        case .available, .dimmed: .white.opacity(0.76)
        }
    }

    private var borderColor: Color {
        switch state {
        case .correct: AppTheme.sage.opacity(0.7)
        case .incorrect: AppTheme.beet.opacity(0.62)
        case .available, .dimmed: AppTheme.paperDeep.opacity(0.9)
        }
    }

    private var resultSymbol: String? {
        switch state {
        case .correct: "checkmark"
        case .incorrect: "xmark"
        case .available, .dimmed: nil
        }
    }

    private var accessibilityLabel: String {
        switch state {
        case .correct: "\(text), correct answer"
        case .incorrect: "\(text), incorrect answer"
        case .available, .dimmed: "Choice \(index + 1), \(text)"
        }
    }
}

private struct LessonCelebrationView: View {
    let lesson: Lesson
    let earnedXP: Int
    let correctAnswers: Int
    let dismiss: () -> Void

    @State private var isCelebrating = false

    private let sparkOffsets = [
        CGSize(width: -118, height: -52),
        CGSize(width: -86, height: -116),
        CGSize(width: -22, height: -132),
        CGSize(width: 48, height: -126),
        CGSize(width: 104, height: -82),
        CGSize(width: 125, height: -16),
        CGSize(width: -126, height: 18),
        CGSize(width: 94, height: 48)
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 26) {
                ZStack {
                    ForEach(sparkOffsets.indices, id: \.self) { index in
                        Image(systemName: index.isMultiple(of: 2) ? "sparkle" : "star.fill")
                            .font(.system(size: index.isMultiple(of: 3) ? 18 : 13, weight: .bold))
                            .foregroundStyle(index.isMultiple(of: 2) ? AppTheme.honey : lessonColor)
                            .offset(sparkOffsets[index])
                            .scaleEffect(isCelebrating ? 1 : 0.15)
                            .opacity(isCelebrating ? 1 : 0)
                            .animation(
                                .spring(response: 0.58, dampingFraction: 0.58)
                                    .delay(Double(index) * 0.045),
                                value: isCelebrating
                            )
                    }

                    Circle()
                        .fill(lessonColor.opacity(0.12))
                        .frame(width: 150, height: 150)
                    Circle()
                        .fill(lessonColor)
                        .frame(width: 112, height: 112)
                        .shadow(color: lessonColor.opacity(0.24), radius: 22, y: 10)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundStyle(.white)
                        .scaleEffect(isCelebrating ? 1 : 0.35)
                        .rotationEffect(.degrees(isCelebrating ? 0 : -12))
                        .animation(.spring(response: 0.58, dampingFraction: 0.65), value: isCelebrating)
                }
                .frame(height: 210)
                .accessibilityHidden(true)

                VStack(spacing: 9) {
                    Text("Lesson complete!")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundStyle(AppTheme.ink)
                        .multilineTextAlignment(.center)
                    Text("You finished \(lesson.title). These words are ready for review.")
                        .font(.title3)
                        .foregroundStyle(AppTheme.secondaryInk)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 12) {
                    LessonResultMetric(
                        value: "+\(earnedXP)",
                        label: "XP earned",
                        symbol: "star.fill",
                        color: AppTheme.plum
                    )
                    LessonResultMetric(
                        value: "\(accuracy)%",
                        label: "Accuracy",
                        symbol: "target",
                        color: AppTheme.sage
                    )
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("WORDS YOU LEARNED")
                        .font(.caption.weight(.bold))
                        .tracking(1.1)
                        .foregroundStyle(lessonColor)

                    ForEach(lesson.phrases) { phrase in
                        HStack(spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(AppTheme.sage)
                            Text(phrase.transliteration)
                                .font(.system(.body, design: .rounded, weight: .bold))
                                .foregroundStyle(AppTheme.ink)
                            Spacer()
                            Text(phrase.meaning)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.secondaryInk)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
                .cardSurface(padding: 18)

                Button(action: dismiss) {
                    HStack {
                        Text("Back to the course")
                        Spacer()
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(lessonColor, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.defaultAction)
            }
            .padding(28)
            .frame(maxWidth: 650)
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            isCelebrating = true
        }
    }

    private var lessonColor: Color {
        AppTheme.color(for: lesson.tone)
    }

    private var accuracy: Int {
        guard !lesson.phrases.isEmpty else { return 0 }
        return Int((Double(correctAnswers) / Double(lesson.phrases.count) * 100).rounded())
    }
}

private struct LessonResultMetric: View {
    let value: String
    let label: String
    let symbol: String
    let color: Color

    var body: some View {
        VStack(spacing: 7) {
            Label(value, systemImage: symbol)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(color)
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, minHeight: 90)
        .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 19, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 19, style: .continuous)
                .stroke(.white.opacity(0.9), lineWidth: 1)
        }
    }
}
