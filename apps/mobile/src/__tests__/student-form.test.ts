import {
  emptyStudentForm,
  studentFormFromDetail,
  toCreateStudentBody,
  toUpdateStudentBody,
  validateStudentForm,
} from "../lib/student-form";

const filled = {
  ...emptyStudentForm(),
  name: "  Sara Student ",
  email: " sara@jpc.test ",
  university: "",
  dateOfBirth: "2004-03-09",
  notes: "Watch attendance",
  seasonId: 7,
};

describe("validateStudentForm", () => {
  it("passes a filled form", () => {
    expect(validateStudentForm(filled)).toEqual({});
  });

  it("names each bad field with a message the screen shows verbatim", () => {
    const errors = validateStudentForm({
      ...filled,
      name: "S",
      email: "nope",
      dateOfBirth: "09/03/2004",
      university: "x".repeat(161),
    });
    expect(errors).toEqual({
      name: "At least 2 characters.",
      email: "Must be a valid email.",
      dateOfBirth: "Use YYYY-MM-DD.",
    });
    expect(validateStudentForm({ ...filled, university: "x".repeat(161) })).toEqual({ university: "Too long." });
  });
});

describe("request bodies", () => {
  it("toCreateStudentBody trims, sends blanks as null, and writes the birthday as UTC midnight (Decision 8)", () => {
    const body = toCreateStudentBody(filled);
    expect(body).toMatchObject({
      name: "Sara Student",
      email: "sara@jpc.test",
      university: null,
      dateOfBirth: "2004-03-09T00:00:00.000Z",
      notes: "Watch attendance",
      seasonId: 7,
    });
    expect(body).not.toHaveProperty("password");
  });

  it("toUpdateStudentBody sends activeSeasonId only when permitted AND changed", () => {
    const initial = { ...filled, seasonId: 7 };
    expect(toUpdateStudentBody(initial, initial, { includeSeasonPointer: true })).not.toHaveProperty("activeSeasonId");
    expect(toUpdateStudentBody({ ...initial, seasonId: 8 }, initial, { includeSeasonPointer: false })).not.toHaveProperty(
      "activeSeasonId",
    );
    expect(toUpdateStudentBody({ ...initial, seasonId: null }, initial, { includeSeasonPointer: true }).activeSeasonId).toBeNull();
  });
});

describe("studentFormFromDetail", () => {
  it("reads v1's browser-local-midnight birthday back as the right day, and keeps internal notes", () => {
    const values = studentFormFromDetail({
      id: 21,
      name: "Sara Student",
      email: "sara@jpc.test",
      avatarPath: null,
      graduationYear: null,
      currentGroup: null,
      enrollments: [],
      profile: {
        university: null, year: null, gifts: null,
        activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
        phone: "+20 100", dateOfBirth: "2004-03-08T22:00:00.000Z", spiritualBackground: null,
        notes: "Watch attendance",
      },
    });
    expect(values).toMatchObject({ dateOfBirth: "2004-03-09", phone: "+20 100", notes: "Watch attendance", seasonId: 7 });
  });
});
