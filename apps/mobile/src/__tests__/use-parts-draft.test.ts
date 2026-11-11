import type { PartDraft } from "../lib/assignment-form-values";
import {
  EMPTY_PARTS_DRAFT,
  canAddForum,
  newPartKey,
  partsDraftReducer,
  type PartsDraft,
} from "../screens/assignment-form/use-parts-draft";

const video: PartDraft = {
  key: "v",
  kind: "VIDEO",
  title: "Talk",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  blockSkipping: false,
  durationSeconds: 600,
};
const essay: PartDraft = {
  key: "e",
  id: 12,
  kind: "ESSAY",
  prompt: "Reflect",
  minWords: null,
  maxWords: null,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
};
const forum: PartDraft = {
  key: "f",
  kind: "FORUM",
  prompt: "Discuss",
  minWords: 50,
  postToRead: true,
  allowComments: false,
};

const draft = (parts: PartDraft[]): PartsDraft => ({ ...EMPTY_PARTS_DRAFT, parts });
const keys = (s: PartsDraft) => s.parts.map((p) => p.key);

describe("partsDraftReducer", () => {
  it("adds a part at the end", () => {
    const next = partsDraftReducer(draft([video]), { type: "add", part: essay });
    expect(keys(next)).toEqual(["v", "e"]);
  });

  it("a second forum can't be added", () => {
    const start = draft([video, forum]);
    expect(canAddForum(start.parts)).toBe(false);
    const next = partsDraftReducer(start, { type: "add", part: { ...forum, key: "f2" } });
    expect(keys(next)).toEqual(["v", "f"]);
    expect(canAddForum([video, essay])).toBe(true);
  });

  it("edits a part in place, keeping its key and id", () => {
    const { key: _key, id: _id, ...input } = essay;
    const next = partsDraftReducer(draft([video, essay]), {
      type: "edit",
      key: "e",
      part: { ...input, prompt: "Reflect again" },
    });
    expect(next.parts[1]).toEqual({ ...essay, prompt: "Reflect again" });
  });

  it("move up/down swaps positions", () => {
    const start = draft([video, essay, forum]);
    expect(keys(partsDraftReducer(start, { type: "move", key: "e", by: -1 }))).toEqual(["e", "v", "f"]);
    expect(keys(partsDraftReducer(start, { type: "move", key: "e", by: 1 }))).toEqual(["v", "f", "e"]);
    // The ends stay put.
    expect(partsDraftReducer(start, { type: "move", key: "v", by: -1 })).toBe(start);
    expect(partsDraftReducer(start, { type: "move", key: "f", by: 1 })).toBe(start);
  });

  it("remove asks first", () => {
    const start = draft([video, essay]);
    const asked = partsDraftReducer(start, { type: "askRemove", key: "e" });
    expect(keys(asked)).toEqual(["v", "e"]);
    expect(asked.removing).toBe("e");

    const cancelled = partsDraftReducer(asked, { type: "cancelRemove" });
    expect(keys(cancelled)).toEqual(["v", "e"]);
    expect(cancelled.removing).toBeNull();

    const removed = partsDraftReducer(asked, { type: "confirmRemove" });
    expect(keys(removed)).toEqual(["v"]);
    expect(removed.removing).toBeNull();
  });

  it("gives every new part its own key", () => {
    expect(newPartKey()).not.toBe(newPartKey());
  });
});
