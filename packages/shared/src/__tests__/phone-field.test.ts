import { normalisePhone, PHONE_MESSAGE, phoneFieldSchema } from "../contact-fields";
import { createStudentRequestSchema } from "../student";

describe("phone (owner, 2026-11-07): 11 digits starting with 01", () => {
  it.each([
    ["01012345678", "01012345678"],
    [" 0101 234 5678 ", "01012345678"],
    ["0101-234-5678", "01012345678"],
    ["+201012345678", "01012345678"],
    ["00201012345678", "01012345678"],
    // A spreadsheet drops the leading 0.
    ["1012345678", "01012345678"],
  ])("accepts %j as %j", (input, stored) => {
    expect(phoneFieldSchema.parse(input)).toBe(stored);
  });

  it.each(["0101234567", "010123456789", "02012345678", "11012345678", "+20 1", "phone", "0101234567x"])(
    "refuses %j with the message",
    (input) => {
      const r = phoneFieldSchema.safeParse(input);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe(PHONE_MESSAGE);
    },
  );

  it("clears with empty or null and leaves absent alone", () => {
    expect(phoneFieldSchema.parse("")).toBeNull();
    expect(phoneFieldSchema.parse("   ")).toBeNull();
    expect(phoneFieldSchema.parse(null)).toBeNull();
    expect(phoneFieldSchema.parse(undefined)).toBeUndefined();
  });

  it("is the same rule on a student's create and edit", () => {
    const base = { name: "Sara Adel", email: "sara@jpc.test", seasonId: 1 };
    expect(createStudentRequestSchema.safeParse({ ...base, phone: "0111" }).success).toBe(false);
    expect(createStudentRequestSchema.parse({ ...base, phone: "0111 222 3333" }).phone).toBe("01112223333");
  });

  it("normalisePhone leaves what can't be a mobile as typed, for the message to name", () => {
    expect(normalisePhone("abc")).toBe("abc");
  });
});
