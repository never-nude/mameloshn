import AVFoundation
import Combine
import Foundation

@MainActor
final class SpeechCoach: NSObject, ObservableObject {
    @Published private(set) var speakingPhraseID: String?

    private let synthesizer = AVSpeechSynthesizer()

    func speak(_ phrase: Phrase, slowly: Bool = false) {
        guard phrase.canSpeak else { return }
        synthesizer.stopSpeaking(at: .immediate)

        let utterance = AVSpeechUtterance(string: phrase.speechCue)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = slowly ? 0.32 : 0.43
        utterance.pitchMultiplier = 0.96
        utterance.preUtteranceDelay = 0.08
        speakingPhraseID = phrase.id
        synthesizer.speak(utterance)

        let estimatedSeconds = max(1.0, Double(phrase.speechCue.count) / (slowly ? 8.0 : 11.0))
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(estimatedSeconds))
            guard !Task.isCancelled else { return }
            self?.speakingPhraseID = nil
        }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        speakingPhraseID = nil
    }
}
