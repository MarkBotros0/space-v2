import {
  MIME_CATEGORY_LABELS,
  configLabel,
  targetLabel,
  trackerStatusLabel,
} from "../lib/assignment-labels";

const groups = [
  { id: 3, name: "Group A" },
  { id: 4, name: "Group B" },
];

describe("targetLabel", () => {
  it("names the whole season, or the targeted groups by name", () => {
    expect(targetLabel(true, [], groups)).toBe("All students");
    expect(targetLabel(false, [3, 4], groups)).toBe("Group A, Group B");
  });

  it("counts groups it cannot name (not loaded yet, or a leader's narrowed list)", () => {
    expect(targetLabel(false, [3, 9], groups)).toBe("Group A + 1 more");
    expect(targetLabel(false, [3, 4], undefined)).toBe("2 groups");
    expect(targetLabel(false, [9], [])).toBe("1 group");
  });
});

describe("trackerStatusLabel", () => {
  it("covers the PENDING sentinel and every submission status", () => {
    expect(trackerStatusLabel("PENDING")).toBe("Not started");
    expect(trackerStatusLabel("DRAFT")).toBe("Draft");
    expect(trackerStatusLabel("SUBMITTED")).toBe("Submitted");
    expect(trackerStatusLabel("REVIEWED")).toBe("Reviewed");
    expect(trackerStatusLabel("RETURNED")).toBe("Returned");
  });
});

describe("configLabel", () => {
  const standard = {
    type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
    maxFileSizeMb: null, allowedMimeCategories: [] as ("pdf" | "image")[],
  };

  it("describes a standard assignment's file settings (null size = no files, R10)", () => {
    expect(configLabel(standard)).toBe("Standard · no file uploads");
    expect(configLabel({ ...standard, maxFileSizeMb: 10 })).toBe("Standard · files up to 10 MB (any type)");
    expect(configLabel({ ...standard, maxFileSizeMb: 10, allowedMimeCategories: ["pdf", "image"] })).toBe(
      `Standard · files up to 10 MB (${MIME_CATEGORY_LABELS.pdf}, ${MIME_CATEGORY_LABELS.image})`,
    );
  });

  it("describes a forum assignment", () => {
    expect(configLabel({ ...standard, type: "FORUM", forumMinWords: 50, forumAllowComments: true })).toBe(
      "Forum · at least 50 words · peer comments on",
    );
    expect(configLabel({ ...standard, type: "FORUM" })).toBe("Forum · at least 0 words");
  });
});
