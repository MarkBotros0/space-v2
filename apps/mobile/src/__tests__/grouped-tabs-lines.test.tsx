import { render, screen } from "@testing-library/react-native";
import type { NoteSummary } from "@space/shared";

import { GroupedNotesTab, GroupedProfileTab } from "../design/students/grouped-tabs";

const mockNotes: { current: NoteSummary[] } = { current: [] };

jest.mock("../hooks/use-notes", () => ({
  useStudentNotes: () => ({ isPending: false, isError: false, data: { pages: [] }, refetch: jest.fn() }),
  flattenNotePages: () => mockNotes.current,
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const LONG = "A long pastoral concern. ".repeat(80);

describe("grouped tabs read free text in full (I1, M2)", () => {
  it("a long note body has no line cap", () => {
    mockNotes.current = [
      {
        id: 1, body: LONG, visibility: "MENTORS", followUpFlagged: false,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", edited: false,
        authorId: 2, authorName: "Mina", authorRole: "MENTOR", seasonId: null, seasonTitle: null, canEdit: false,
      },
    ];
    render(<GroupedNotesTab studentId={1} canWriteNote={false} onWrite={() => {}} />);
    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
  });

  it("a long profile value has no line cap", () => {
    render(
      <GroupedProfileTab
        profile={{ university: "AUC", year: "3", gifts: LONG } as never}
      />,
    );
    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
  });
});
