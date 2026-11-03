// The quiz domain's wire contracts, split by concern.
//
// Wire shapes — timestamps are ISO strings, per the note in season.ts.
//
// THE CENTRAL DECISION OF THIS DOMAIN (spec §8, D2): there is no schema
// anywhere in this folder with an optional `correctIndex`. The presence of the
// answer key is a DIFFERENT TYPE, so a client parsing the student shape can
// never be handed the key as a typed field. On the server, the raw-JSON
// integration test in the attempts task is the guarantee; the typed
// `toStudentQuestion` mapper there catches the most likely edit (a
// `correctIndex` line added to its literal) at typecheck, but structural
// typing lets a spread through, so the test is what must never be weakened.
// v1's protection was a `select` list living in the same file as the two
// reads that do return the key.

export * from "./read";
export * from "./grading";
export * from "./writes";
export * from "./responses";
