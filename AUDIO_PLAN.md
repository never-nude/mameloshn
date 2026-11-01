# Audio plan

This app teaches a family-centered **Bessarabia–Odessa variety of Southeastern Yiddish** in Latin letters. Audio should help the learner imitate a real family voice. It should not imply that one recording represents every town or household in the region.

## What the app does now

`SpeechCoach` sends each phrase's hand-tuned `speechCue` to Apple's `en-US` voice. It uses a normal rate of `0.43`, a slow rate of `0.32`, and a pitch multiplier of `0.96`.

This is a useful placeholder, not Yiddish speech synthesis. The English voice guesses from phonetic spellings such as `goot MOR-gen`, so vowels, `kh`, stress, and sentence rhythm will sometimes be wrong. Results can also differ by installed Apple voice and OS version. Keep calling this **Rough audio** and keep `speechCue` separate from the learner-facing transliteration and pronunciation guide. Apple exposes installed voices through [`AVSpeechSynthesisVoice.speechVoices()`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice/speechvoices%28%29), but the app should not assume that a usable Yiddish voice exists.

## Recommended upgrade: human recordings first

Start with the phrases that are already in the curriculum rather than attempting a synthetic voice.

1. Record one living speaker whose family language is as close as possible to Bessarabia, Odessa, or southern Ukrainian Yiddish. Capture the speaker's town or family origin, age/background, and their own wording for each phrase. When the speaker's form differs from the course, preserve both and label the family form.
2. Begin with 100–150 high-value phrases. Record a natural take and a careful take where possible. Keep mono 48 kHz/24-bit WAV masters; export compact AAC/M4A files for the app.
3. Name assets by stable phrase ID, for example `greeting_good_morning.normal.m4a` and `greeting_good_morning.careful.m4a`. Do not derive filenames from display text.
4. Play sources in this order: human natural recording, human careful recording or slowed natural recording, then the existing Apple approximation. The app can remain fully offline.
5. Have the speaker or another knowledgeable listener approve each edited clip. Mark uncertain or disputed forms in the content instead of silently choosing one.

Even for a personal app, get a short written release covering recording, editing, storage in the app, and family sharing. Permission to train or clone a voice should be a separate explicit choice. Preserve unedited masters and never make a synthetic version of a deceased relative's voice without clear rights and family consent.

## Optional YiddishLabs experiment

[YiddishLabs' API](https://app.yiddishlabs.com/app/developer/api-docs) currently offers Yiddish TTS, voice discovery, speed control, and WAV output. It is worth a small test, not yet a dialect solution.

Create a 20-phrase probe set containing the app's important Bessarabian–Odessan vowel and consonant contrasts. Ask a knowledgeable listener to compare every available voice with the human target. The public documentation does not identify Ukrainian/Bessarabian dialects or clearly grant the right to redistribute generated clips. Before bundling any result, obtain written answers about generated-audio ownership, offline caching, app distribution, and commercial use.

For this personal project, the simplest safe experiment is to generate test files during development and keep the API key out of the shipped app. If the app ever calls the service at runtime, place the key behind a small server rather than embedding it in Swift code.

## What REYD can and cannot provide

The open [REYD dataset](https://datashare.ed.ac.uk/items/d5f32110-5f78-4b9f-8dc8-ec7888be3ff4/full) contains 4,892 clips, about 7.9 hours, from three speakers. Its recordings and transcripts are CC BY 4.0, and the project publishes [code and samples](https://github.com/REYD-TTS).

Two speakers are Litvish and one is Polish Yiddish. None is documented as Bessarabian or Ukrainian. REYD is useful for proving an offline TTS pipeline, testing playback, or offering a clearly labeled general-Yiddish fallback. It must not be presented as the grandparents' dialect. If any REYD material ships, include the required attribution and identify the actual speaker/dialect rather than relabeling it.

## Dialect reference sources

- Columbia's [Language and Culture Archive of Ashkenazic Jewry](https://guides.library.columbia.edu/c.php?g=730523&p=5217986) is the best reference for locality-specific historical Eastern Yiddish. Use it to identify relevant towns, compare features, and prepare prompts for a living speaker. Its [rights statement](https://guides.library.columbia.edu/c.php?g=730523&p=6101614) does not provide blanket permission to redistribute recordings, so do not copy clips into the app without permission.
- The Yiddish Book Center's [Wexler Oral History Project](https://www.yiddishbookcenter.org/collections/oral-histories) can help locate speakers and family histories. Treat interviews as reference material unless the Center grants specific reuse rights.
- [Kaikki's machine-readable Yiddish Wiktionary extraction](https://kaikki.org/dictionary/Yiddish/index.html) contains IPA and some regional labels. It can support editorial research, but entries need human review and the underlying Wiktionary content carries attribution/share-alike obligations.

Archive recordings should guide the course; licensed recordings made for this app should be its audio assets.

## Provenance and licensing checklist

Keep a manifest entry beside every audio file with:

- phrase ID, exact spoken text, display transliteration, and pronunciation guide;
- speaker name or approved credit, town/region, and dialect note;
- recording date, recorder/editor, master filename, and edits applied;
- source URL when applicable, license name, required credit, and release location;
- review status and the name/date of the dialect review.

Generated audio rights are separate from the license of the TTS code or training dataset. CC BY material needs attribution; CC BY-SA content may require adapted content to use the same license. Family recordings and archive access do not imply permission to publish. Do not scrape pronunciation playback from Google Translate or another consumer translation site: its playback is not a supported, licensed Yiddish audio source for an app.

The first audio milestone is complete when the top 100–150 phrases have reviewed human recordings, the app falls back cleanly to rough Apple speech when a recording is absent, and every clip has a documented source and permission status.
