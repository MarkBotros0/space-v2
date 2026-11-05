import { VISIBILITY_DESCRIPTION, VISIBILITY_LABEL } from "../lib/note-visibility";

it("keeps the visibility copy the API enforces, in one place", () => {
  expect(VISIBILITY_LABEL).toEqual({
    LEADERS: "Visible to group leaders only",
    MENTORS: "Visible to mentors only",
    ADMINS: "Visible to season admins only",
  });
  expect(VISIBILITY_DESCRIPTION).toBe(
    "Only the group you choose can read this note, plus you and SUPER users. Season admins do not automatically see leader or mentor notes.",
  );
});
