// The quiz domain's wire contracts, split by concern.
//
// Wire shapes — timestamps are ISO strings, per the note in season.ts.
//
// THE CENTRAL DECISION OF THIS DOMAIN (spec §8, D2): the answer key lives only
// in the authoring read (`questions.ts`), the grading read (`grading.ts`) and
// the student's `review` object (`student.ts`), which is null until the answers
// are released. A client parsing the student question never gets the key as a
// top-level typed field. On the server, the raw-JSON integration test is the
// guarantee; structural typing lets a spread through, so that test is what
// must never be weakened.

export * from "./questions";
export * from "./student";
export * from "./read";
export * from "./grading";
export * from "./writes";
export * from "./responses";
