# Signblast for iOS

A native SwiftUI version of Signblast: learn the ASL fingerspelling alphabet with four games.

- **Sign Sprint**: 60 seconds, sign each letter as fast as you can (combo multiplier, hints for weak letters).
- **Spell It**: fingerspell words from emoji clues (the first word is always CAB).
- **Echo**: watch a sequence of letters, then sign it back from memory; it grows each round.
- **Mystery Word**: guess a hidden word by signing letters; 6 wrong guesses per word.

Plus **Learn** (all 26 handshapes, with a live "check my sign" screen), **Progress** (Leitner boxes,
streak, accuracy, hardest letters, best scores) and **Settings** (camera or tap pad, hold time, haptics, reset).

## How it works
- Hand tracking: Apple Vision (`VNDetectHumanHandPoseRequest`) finds 21 hand points per frame, in the same
  order as MediaPipe in the web app. `Signs/HandClassifier.swift` is a direct port of `app/recognizer.js`.
- A letter fires after it is held for 8 frames (adjustable in Settings), and again every 14 frames if held.
- Progress is stored only on the phone (UserDefaults). Video never leaves the device. No server is needed.
- No camera (the simulator, or permission denied)? Every screen shows a tap pad: tap a letter to "sign" it.

## Run it
Open `mobile/Signblast.xcodeproj` in Xcode, pick an iPhone simulator or your iPhone, and press Run.
The camera only works on a real iPhone (set your signing team under Signing & Capabilities first).
