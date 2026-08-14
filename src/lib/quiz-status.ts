// Temporary kill-switch for the public "Find your compass" quiz.
//
// While this is `true`:
//   - /quiz renders a short bilingual "on pause" note instead of the quiz, so
//     direct links and anything shared on social land somewhere graceful.
//   - the storefront ladder hides any offer card that links to /quiz, so the
//     page isn't advertised while it's on hold.
//
// Flip to `false` to relaunch — nothing else needs to change.
//
// Paused 2026-08-14 pending a decision on the "workbook" the opt-in promises
// (the result screen says a workbook is "on its way," but nothing is sent yet).
export const QUIZ_PAUSED = true;
