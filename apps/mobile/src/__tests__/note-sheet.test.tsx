import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useState } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  ...jest.requireActual("../design/ui/toaster"),
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("../design/motion", () => ({
  ...jest.requireActual("../design/motion"),
  haptic: jest.fn(),
}));

import { toast } from "../design/ui/toaster";
import { NoteSheet } from "../screens/student-detail/note-sheet";
import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { Text } from "react-native";

const savedNote = {
  id: 1,
  body: "x",
  visibility: "MENTORS",
  followUpFlagged: false,
  createdAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:00:00.000Z",
  edited: false,
  authorId: 5,
  authorName: "L",
  authorRole: "LEADER",
  seasonId: null,
  seasonTitle: null,
  canEdit: true,
};
const post = (apiClient as unknown as { post: jest.Mock }).post;

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Text onPress={() => setOpen(true)}>reopen</Text>
      <Text>{open ? "state open" : "state closed"}</Text>
      <NoteSheet open={open} onClose={() => setOpen(false)} studentUserId={21} />
    </>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("NoteSheet", () => {
  it("refuses a too-short note with no request", async () => {
    renderWithProviders(<Harness />);
    fireEvent.changeText(await screen.findByLabelText("Note"), " x ");
    fireEvent.press(screen.getByText("Add note"));
    expect(await within(await screen.findByTestId("sheet-save-bar")).findByText("Note can't be empty.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("sends MENTORS after a segmented change, then resets and closes", async () => {
    post.mockResolvedValue({ data: { data: { note: savedNote } } });
    renderWithProviders(<Harness />);
    fireEvent.changeText(await screen.findByLabelText("Note"), "Checked in with him.");
    fireEvent.press(screen.getByRole("tab", { name: "Mentors" }));
    fireEvent.press(screen.getByText("Add note"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/notes", {
        body: "Checked in with him.",
        visibility: "MENTORS",
        followUpFlagged: false,
      }),
    );
    expect(await screen.findByText("state closed")).toBeTruthy();
    fireEvent.press(screen.getByText("reopen"));
    expect(screen.getByLabelText("Note").props.value).toBe("");
    expect(toast.success).toHaveBeenCalledWith("Note added.");
  });

  it("keeps the text when dismissed and reopened", async () => {
    renderWithProviders(<Harness />);
    fireEvent.changeText(await screen.findByLabelText("Note"), "Half a thought");
    fireEvent.press(screen.getByTestId("sheet-backdrop"));
    expect(await screen.findByText("state closed")).toBeTruthy();
    fireEvent.press(screen.getByText("reopen"));
    expect(await screen.findByText("state open")).toBeTruthy();
    expect(screen.getByLabelText("Note").props.value).toBe("Half a thought");
    expect(post).not.toHaveBeenCalled();
  });

  it("stays open with the message when the request fails", async () => {
    post.mockRejectedValue(new Error("offline"));
    renderWithProviders(<Harness />);
    fireEvent.changeText(await screen.findByLabelText("Note"), "A real note");
    fireEvent.press(screen.getByText("Add note"));
    expect(
      await within(await screen.findByTestId("sheet-save-bar")).findByText(
        "Couldn't save that note. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Note").props.value).toBe("A real note");
  });
});
