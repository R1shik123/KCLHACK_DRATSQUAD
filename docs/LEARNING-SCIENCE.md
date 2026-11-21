# Signfall: the learning science

**One line:** every letter you shoot down is a recall test performed with your body, scheduled by
spaced repetition and kept in your challenge zone by adaptive difficulty.

## Feature → principle

| Game feature | Principle | Why it helps |
|---|---|---|
| A falling letter asks you to *produce* its sign from memory (no multiple choice) | **Retrieval practice / testing effect** | Pulling an answer out of memory strengthens it more than re-reading it |
| You make the handshape yourself instead of recognising it | **Generation effect** | Self-generated answers are remembered better than ones you're shown |
| Signs are made with your hand, seen by the camera | **Embodied cognition, motor (procedural) memory** | The movement itself is learned; memory is tied to the action, not just the image |
| Instant hit (laser, sound, points) or miss (lost life, "MISSED A") | **Immediate corrective feedback (operant reinforcement)** | Feedback within a second links the action to its result |
| Missed letters go to Leitner box 1 and fall ~3x more often; hits move up a box | **Spaced repetition (Leitner boxes, Ebbinghaus forgetting curve)** | Review weak items often and strong items less, just before they'd be forgotten |
| Letters on screen are mixed, not drilled one at a time | **Interleaving / contextual interference** | Having to tell A from Y from I builds discrimination; blocked drills feel easier but stick less |
| Time pressure, mixed letters, hints that disappear | **Desirable difficulties (Bjork)** | Effortful learning feels harder but lasts longer |
| Accuracy > 80% → 10% faster; < 60% → 10% slower | **Flow and adaptive difficulty (Csikszentmihalyi; zone of proximal development)** | Keeps you between boredom and anxiety, just beyond what you can already do |
| Handshape hint appears as a letter nears the bottom; fades as the letter's box rises | **Scaffolding and fading** | Support when you need it, removed as you improve |
| Level 1: A B L · Level 2: + V Y · Level 3: + I C D | **Cognitive load theory, chunking** | A few new items at a time keeps working memory free for learning |
| Letter glyph + plain-English description + your own hand on screen with landmark dots | **Dual coding** | Words and images together give two routes back to the memory |
| Signing under a falling clock; reaction time is tracked | **Automaticity** | Fingerspelling in real conversation is fast; fluency means no conscious lookup |
| Daily streak calendar, letters-mastered count, "hardest letters" | **Self-efficacy** | Visible progress builds the belief that you can do it, which keeps you practising |

## How it works (one slide)
1. Camera → MediaPipe Hand Landmarker (21 points per hand, runs in the browser; video never leaves the device).
2. Distance ratios between points → 6 features (thumb out, 4 finger extensions, index–middle spread), so it
   works at any hand size, distance or rotation and with either hand.
3. Nearest template with an acceptance threshold and a margin over the runner-up; a sign counts after it's held steady for 8 frames.
4. The game updates each letter's Leitner box, the speed and the hints. Progress is stored only in the browser (localStorage).

## Honest limits
- **8 static letters only** (A B C D I L V Y). J and Z need motion; other letters need finer finger detail than this recogniser checks.
- **Fingerspelling is not the whole language.** ASL has its own grammar, facial expression and movement; the alphabet is a small, useful start.
- **It complements Deaf-led teaching; it doesn't replace it.** Learn from Deaf teachers and the Deaf community.
- **Recognition depends on the camera.** Lighting, background and hand angle affect accuracy; it can misread similar shapes.
- Mastery means "shot down reliably in this game", not a formal assessment.
