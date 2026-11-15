import { fireEvent, screen, within } from "@testing-library/react-native";

// File uploads are off app-wide until real storage exists (owner, 2026-11-16): no upload option
// shows anywhere, a saved essay keeps its setting, and files already attached still show.
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import { FILE_UPLOADS_AVAILABLE } from "../lib/app-config";
import { EssayFiles } from "../screens/assignment-detail/essay-sections";
import { EssayPartSheet } from "../screens/assignment-form/part-sheets/essay-part-sheet";
import type { EssayDraft } from "../screens/assignment-form/part-sheets/part-fields";
import { essayDetail } from "./helpers/assignment-fixtures";
import { renderWithProviders } from "./helpers/render";

const saved: EssayDraft = {
  key: "k1",
  id: 2,
  kind: "ESSAY",
  title: "Reflection",
  prompt: "Who are you in the story?",
  minWords: 50,
  maxWords: null,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf"],
} as EssayDraft;

describe("file uploads are off", () => {
  it("is switched off", () => {
    expect(FILE_UPLOADS_AVAILABLE).toBe(false);
  });

  it("the essay sheet offers no file uploads, and saving keeps a saved essay's setting", () => {
    const onSave = jest.fn();
    renderWithProviders(<EssayPartSheet open initial={saved} onClose={jest.fn()} onSave={onSave} />);
    expect(screen.queryByText("Allow file uploads")).toBeNull();
    expect(screen.queryByLabelText("Max file size (MB)")).toBeNull();
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ maxFileSizeMb: 10, allowedMimeCategories: ["pdf"] }));
  });

  it("the student's essay shows no Files section, unless files are already attached", () => {
    const essay = essayDetail("DRAFT", "draft", { maxFileSizeMb: 10 });
    const { unmount } = renderWithProviders(<EssayFiles essay={essay} readOnly={false} />);
    expect(screen.queryByText(/Files \(max/)).toBeNull();
    expect(screen.queryByText(/attachments aren't available/)).toBeNull();
    unmount();

    const file = { id: 1, originalName: "notes.pdf", sizeBytes: 2048 } as (typeof essay.files)[number];
    renderWithProviders(<EssayFiles essay={{ ...essay, files: [file] }} readOnly={false} />);
    expect(screen.getByText("notes.pdf")).toBeTruthy();
    expect(screen.queryByText(/attachments aren't available/)).toBeNull();
  });
});
