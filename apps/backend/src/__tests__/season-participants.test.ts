import { seasonParticipant } from "../lib/queries/season-participants";

// The shape is the rule: ACTIVE anywhere, COMPLETED only in a finished season,
// WITHDRAWN never. Pinned because a loosened copy (COMPLETED anywhere) would
// bring a graduate back onto a live roster and still pass the "not empty" tests.
it("means ACTIVE, or COMPLETED in a finished season, and never WITHDRAWN", () => {
  expect(seasonParticipant).toEqual({
    OR: [
      { status: "ACTIVE" },
      { status: "COMPLETED", season: { status: { in: ["COMPLETED", "ARCHIVED"] } } },
    ],
  });
});
