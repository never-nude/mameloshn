# Ziskeit

<p align="center">
  <img src="Mameloshn/Assets.xcassets/AppIcon.appiconset/AppIcon-iOS-1024.png" width="170" alt="Ziskeit app icon">
</p>

Ziskeit is a personal Yiddish learning app for recovering the spoken language of a family whose roots run through Bessarabia toward Odessa. The course is written entirely in Latin letters. It starts from broad Southeastern Yiddish patterns, labels uncertainty, and makes the learner's own family words part of the curriculum.

This is an early family preview. Learning progress and family words stay on the device; the app has no account or analytics. The public repository contains the source. The native iPhone build will require TestFlight, while the interactive website works in Safari now.

## Learn in your browser

**[Open Ziskeit (ZISS-kite), the interactive course](https://yiddish.wiki/)**

Ziskeit is the web edition: a warm, conversation-led way to learn the Yiddish a grandparent might use with family. It includes seven lessons, short family exchanges, read/listen/recall exercises, gentle spaced return, the searchable phrasebook, and private Family Words. It works on phones and computers, can be added to an iPhone Home Screen, and keeps learning data in that browser. Family notes can be exported and imported as a private backup.

## Download for Mac

**[Download Mameloshn 0.1.0](https://github.com/never-nude/mameloshn/releases/latest/download/Mameloshn-0.1.0-macOS.zip)**

Requires macOS 15 or later. Double-click the downloaded ZIP, then move **Mameloshn** to the Applications folder and open it. The current signed preview keeps its original filename; the updated source presents the app as **Ziskeit**. The release is signed with an Apple Developer ID and notarized by Apple.

The learning loop uses short sessions, immediate feedback, varied prompts, and quiet review scheduling. It centers remembrance, belonging, and returning to family voices.

## What works

- One SwiftUI codebase for macOS and iPhone
- Seven short lessons and roughly fifty phrases
- Meaning, listening, and recall challenges in a focused lesson session
- Broad Southeastern variants shown beside a consistent reference form
- Spaced return with Needs time, I remember, and Feels familiar scheduling
- A private Family Words notebook; added words enter the review deck
- Local learning and family notes with no account or analytics
- Fixed web voice clips for every spoken phrase and conversation line, with no browser-voice fallback
- Record-and-listen-back conversation practice; takes remain in the current tab
- Approximate on-device pronunciation in the native preview
- Dynamic Type-friendly adaptive layouts: sidebar on macOS and tabs on iPhone
- A responsive, installable GitHub Pages version with local progress and offline course access after the first visit

## Run it

The native project currently requires macOS 15 or iOS 18. Open `Mameloshn.xcodeproj` in Xcode 27 or later, choose the **Mameloshn** scheme, and run on **My Mac** or an iPhone simulator.

Command-line builds:

```sh
xcodebuild \
  -project Mameloshn.xcodeproj \
  -scheme Mameloshn \
  -destination 'platform=macOS' \
  -derivedDataPath /tmp/Mameloshn-mac \
  CODE_SIGNING_ALLOWED=NO build

xcodebuild \
  -project Mameloshn.xcodeproj \
  -scheme Mameloshn \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro,OS=27.0' \
  -derivedDataPath /tmp/Mameloshn-ios \
  CODE_SIGNING_ALLOWED=NO build
```

## Dialect policy

“Ukrainian Yiddish” and “Bessarabia–Odessa” describe a family geography, not one perfectly uniform dialect. The app therefore uses:

1. a consistent Latin reference form so words remain searchable and learnable;
2. carefully labeled broad Southeastern comparisons where evidence supports them;
3. the learner's exact family version as the highest-authority form once known.

The course never requires Hebrew-script literacy. Exact towns, remembered sayings, and recordings can refine it over time without rebuilding the learning system.

Useful references include the [YIVO overview of Yiddish dialects](https://www.dovidkatz.net/dovid/PDFLinguistics/2008_YIDDISH_Yivo_Encyclopedia.pdf) and the [Corpus of Spoken Yiddish in Europe user guide](https://www.yiddishcorpus.org/csye/user-guide/).

## Audio

The web edition ships compact fixed voice clips so playback sounds the same in each browser. They are rendered offline in a **cloned family voice**: [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (0.6B Base, run locally with MLX) imitates a short reference recording of the speaker and reads each Yiddish line in that voice, with the YIVO spelling respelled for the model. The pipeline, its settings and the per-clip provenance manifest live in [tools/voice](tools/voice/README.md). The clips are synthetic references in a real family voice, not authenticated Bessarabia/Odessa recordings. The browser’s built-in speech voice is never used as a fallback.

The native preview’s `SpeechCoach` still feeds hand-tuned phonetic cues to an installed Apple English voice. It remains an offline prototype aid.

The preferred next step is a small set of licensed human recordings from a speaker with relevant family geography. See [AUDIO_PLAN.md](AUDIO_PLAN.md) for the recording format, provenance model, source research, and fallback order.

## Project map

- `Mameloshn/Data/Curriculum.swift` — lessons, phrases, sound cues, and regional variants
- `Mameloshn/AppModel.swift` — persistence, learning continuity, review scheduling, and family words
- `Mameloshn/Views/LessonSessionView.swift` — the active learning loop
- `Mameloshn/Views/` — home, lesson library, practice, phrasebook, and family notebook
- `Mameloshn/Services/SpeechCoach.swift` — approximate offline playback
- `docs/` — the no-build interactive website deployed through GitHub Pages

Copyright © 2026 Michael Kushman. All rights reserved.
