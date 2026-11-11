# Quiz integrity: device checks

Owed to the owner on a real iPhone and a real Android (TestFlight or a dev build). Screenshot blocking,
split screen, Control Center and the notification shade do not show in a simulator. Nothing here has been
run: the UI sweep and this check were postponed by the owner. Fill in the Result column (pass, fail, and
what you saw) and note the build number at the top.

Build: ____  iPhone: ____  Android: ____

Rules: `docs/rules/quiz-integrity.md`. Use a timed quiz and an untimed one where it matters. "Exit" means
one EXIT or RELAUNCH row in the staff exit log (attempt sheet) or on the live screen.

## Plan Task 7 Step 3

| # | Device | Check | Result |
|---|---|---|---|
| 1 | iPhone and Android | A screenshot is blank (or blocked) | |
| 2 | Both | Home, then back to the quiz: the warning shows | |
| 3 | Both | The third exit ends the attempt (result, no questions) | |
| 4 | Both | Kill and reopen: lands in the quiz, one exit | |
| 5 | iPhone | Control Center peek does not warn | |
| 6 | Android | Notification shade does not warn | |
| 7 | Android | Split screen warns | |

## Android

| # | Check | Result |
|---|---|---|
| 8 | Keyboard open in essay and fill-in, typing for more than 5 s: no warning, no EXIT row | |
| 9 | Split screen for more than 1 s is one exit; a drag shorter than 1 s is none; split screen then home is one exit | |
| 10 | Foldable fold and unfold, one-handed mode: no false exit | |
| 11 | Force stop, reopen: one RELAUNCH | |
| 12 | Hardware back does nothing on the form, the reopened before-you-start, and the loading and error screens | |
| 13 | Recents peek counts as an exit (known limit); note what happens | |

## iPhone

| # | Check | Result |
|---|---|---|
| 14 | Control Center, notification centre, a Face ID or dictation prompt, the start of the app-switcher gesture: none count | |
| 15 | Power-button lock counts as one exit | |
| 16 | Swipe back and the full-screen swipe are off on the held quiz (form and reopened before-you-start), on again after submit | |

## Both phones

| # | Check | Result |
|---|---|---|
| 17 | A full-screen call answered counts once; an ignored banner does not | |
| 18 | Kill from the switcher, reopen: one RELAUNCH, lands in the quiz with Home under it | |
| 19 | Airplane mode: leave and return shows the warning at once; reconnect gives one EXIT row | |
| 20 | Third exit offline, then reconnect: the ended result, no questions | |
| 21 | Airplane-mode cold launch: note what the student sees; reconnect and sign in lands in the quiz | |
| 22 | "Submit quiz?" open, go home, come back: the warning is visible | |
| 23 | Screenshot: blocked or blank, no warning, a SCREENSHOT row in the staff log, exit count unchanged | |
| 24 | Fresh install or update with an attempt open: how long Home shows before the quiz | |
| 25 | Push tap during an attempt: back to the quiz, one quiz screen, one exit | |
| 26 | `spacev2://checkin/<token>` warm and cold during an attempt: lands in the quiz | |
| 27 | Staff unpublish or End while the student is on the form: the screen moves on, the lock lifts without a relaunch | |
| 28 | Role switch or forced sign-out mid-attempt: lock released; sign back in: held again | |

## Staff screens

| # | Check | Result |
|---|---|---|
| 29 | Live screen: End attempt shows its confirm dialog on iPhone (nested in the sheet) | |
| 30 | Live screen: the three stat tiles sit 2 + 1 at 360 dp | |
| 31 | Before you start at 360 x 640 and font 1.3: the three points and the SaveBar fit, the error line is visible | |
