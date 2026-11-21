# Signfall: Devpost submission text

**Tagline:** Learn the ASL alphabet by playing an arcade classic: make the handshape at your webcam to shoot the falling letter.

**Track:** Retro Remix (Old Tech, New Tricks)

## Inspiration
Learning to fingerspell is a motor skill, not a vocabulary list: you have to produce the shape, fast, from memory.
Flashcards don't train that. Arcade games already have the exact loop a learner needs: a cue appears, you have
seconds to respond, you get instant feedback, and the game speeds up as you improve. So we rebuilt the classic
falling-enemies arcade shooter, where your hand is the controller.

## What it does
- **Play:** letters descend like an arcade wave. Make the letter's ASL handshape at your webcam and hold it to fire. Score, levels, lives and combos, in a retro pixel screen.
- **Learn:** each handshape in plain English, plus a live "check my sign" mode that shows what the camera sees and your confidence.
- **Progress:** streak calendar, accuracy, best score, average reaction time, mastery per letter, and your hardest letters.
- **Starting letters:** 8 ASL letters (A, B, C, D, I, L, V, Y), introduced in small groups.
- **Privacy and access:** video never leaves the device (hand-tracking runs in the browser), and there's a keyboard practice mode when no camera is available.

## Why the loop works (from docs/LEARNING-SCIENCE.md)
- **Retrieval practice and the generation effect:** every letter must be produced from memory, with no multiple choice.
- **Embodied cognition / motor memory:** you learn the movement itself.
- **Immediate corrective feedback:** a hit or a miss within a second of acting.
- **Spaced repetition (Leitner boxes):** missed letters fall about 3× more often until mastered.
- **Interleaving and desirable difficulties:** letters are mixed, and hints fade as mastery rises (scaffolding → fading).
- **Flow / zone of proximal development:** speed adapts to keep accuracy between 60% and 80%.
- **Cognitive load:** letters arrive in chunks of 2–3.
- **Self-efficacy:** streaks and visible progress.

## How we built it
- **Hand tracking:** MediaPipe Hand Landmarker (21 points per hand) in the browser.
- **Recogniser:** our own, using rotation-independent features (finger extension, thumb position, finger spread, thumb–finger touch) matched against a handshape template for each letter. A letter counts only when it clearly beats its nearest rival and is held steady.
- **Game:** an HTML canvas game with a Leitner-box scheduler and adaptive speed.
- **App:** a premium mobile-first interface in plain HTML/CSS/JS, served by a small FastAPI server.
- **Built in JetBrains IntelliJ with AI coding agents.**

## Challenges
- Telling similar shapes apart (C vs O-like shapes, D vs pointing) without training data. We used geometric features plus distinctive checks, such as the thumb touching the middle finger for D.
- Making the game teach, not just test: hints that fade, and weak letters that come back more often.

## Honest limits
8 static letters only (J and Z need motion). Fingerspelling is a small part of ASL. Lighting and camera angle
affect accuracy. Signfall complements Deaf-led teaching; it doesn't replace it.

## What's next
The full alphabet including motion letters (J, Z), common words, BSL two-handed fingerspelling, and a classroom mode.

## Built with
javascript, html, css, mediapipe, canvas, webaudio, python, fastapi, jetbrains-intellij, claude
