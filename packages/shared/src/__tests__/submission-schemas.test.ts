import { essayWordRangeMessage, reviewEssayRequestSchema, saveEssayDraftRequestSchema } from "../index";

describe("saveEssayDraftRequestSchema", () => {
  it("accepts text up to 20,000 characters and refuses one more", () => {
    expect(saveEssayDraftRequestSchema.safeParse({ text: "a".repeat(20_000) }).success).toBe(true);
    expect(saveEssayDraftRequestSchema.safeParse({ text: "a".repeat(20_001) }).success).toBe(false);
  });

  it("still accepts an empty draft", () => {
    expect(saveEssayDraftRequestSchema.safeParse({ text: "" }).success).toBe(true);
  });
});

describe("reviewEssayRequestSchema", () => {
  it("marks reviewed with or without feedback", () => {
    expect(reviewEssayRequestSchema.safeParse({ action: "reviewed", feedback: null }).success).toBe(true);
    expect(reviewEssayRequestSchema.safeParse({ action: "reviewed", feedback: "Good." }).success).toBe(true);
  });

  it("needs a note to return, and says so", () => {
    for (const feedback of [null, "", "   "]) {
      const parsed = reviewEssayRequestSchema.safeParse({ action: "return", feedback });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe("Say what to change");
    }
    expect(reviewEssayRequestSchema.safeParse({ action: "return", feedback: "Add a source." }).success).toBe(true);
  });

  it("refuses an unknown action and an over-long note", () => {
    expect(reviewEssayRequestSchema.safeParse({ action: "approve", feedback: null }).success).toBe(false);
    expect(reviewEssayRequestSchema.safeParse({ action: "reviewed", feedback: "a".repeat(20_001) }).success).toBe(
      false,
    );
  });
});

describe("essayWordRangeMessage", () => {
  it("says the count and the bound, as the server refuses a hand-in", () => {
    expect(essayWordRangeMessage(142, 150, 300)).toBe("This is 142 words; it needs at least 150.");
    expect(essayWordRangeMessage(320, 150, 300)).toBe("This is 320 words; it needs at most 300.");
    expect(essayWordRangeMessage(1, 2, null)).toBe("This is 1 word; it needs at least 2.");
  });

  it("asks for words when there are none, whatever the range", () => {
    expect(essayWordRangeMessage(0, null, null)).toBe("Write your essay before handing it in.");
  });

  it("is null inside the range", () => {
    expect(essayWordRangeMessage(200, 150, 300)).toBeNull();
    expect(essayWordRangeMessage(5, null, null)).toBeNull();
  });
});
