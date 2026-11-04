import { updateSubmissionRequestSchema } from "../index";

describe("updateSubmissionRequestSchema", () => {
  it("accepts text up to 20,000 characters and refuses one more", () => {
    expect(updateSubmissionRequestSchema.safeParse({ text: "a".repeat(20_000) }).success).toBe(true);
    expect(updateSubmissionRequestSchema.safeParse({ text: "a".repeat(20_001) }).success).toBe(false);
  });

  it("still accepts an empty draft", () => {
    expect(updateSubmissionRequestSchema.safeParse({ text: "" }).success).toBe(true);
  });
});
