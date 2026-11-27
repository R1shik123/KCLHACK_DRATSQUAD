# Signblast for iOS

A native SwiftUI version of Signblast: learn the ASL fingerspelling alphabet with four games.

- **Sign Sprint**: 60 seconds, sign each letter as fast as you can (combo multiplier, hints for weak letters).
- **Spell It**: fingerspell words from emoji clues (the first word is always CAB).
- **Echo** (the main game, E1–E3 in `docs/PRODUCT.md`): a level path like a mobile puzzle game. Watch a sequence, sign it
  back from memory. 3 rounds a level, 3 hearts, one Show again, up to 3 stars, a boss every 5th level. It climbs from
  2-letter runs to longer runs, single words, longer words, word pairs and endless Expert levels (words from `design/words.json`).
- **Mystery Word**: guess a hidden word by signing letters; 6 wrong guesses per word.

Plus **Learn** (all 26 handshapes, with a live "check my sign" screen), **Progress** (Leitner boxes,
streak, accuracy, hardest letters, best scores) and **Settings** (camera or tap pad, hold time, haptics, reset).

## How it works
- The shared UI contract is bundled at build time (`design/tokens.json`, `copy.json`, `words.json`, see the
  "Copy shared design files" build phase) and read by `Design/DesignSystem.swift`. Echo takes every colour, size and string
  from it; the other screens are still the original skeleton.
- Hand tracking: Apple Vision (`VNDetectHumanHandPoseRequest`) finds 21 hand points per frame, in the same
  order as MediaPipe in the web app. `Signs/HandClassifier.swift` is a direct port of `app/recognizer.js`.
- A letter fires after it is held for 8 frames (adjustable in Settings), and again every 14 frames if held.
- Progress is stored only on the phone (UserDefaults). Video never leaves the device. No server is needed.
- No camera (the simulator, or permission denied)? Every screen shows a tap pad: tap a letter to "sign" it.

## Run it
Open `mobile/Signblast.xcodeproj` in Xcode, pick an iPhone simulator or your iPhone, and press Run.
The camera only works on a real iPhone (set your signing team under Signing & Capabilities first).
