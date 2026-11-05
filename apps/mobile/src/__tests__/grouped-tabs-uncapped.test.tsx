import { screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockNotes = jest.fn();
jest.mock("../hooks/use-notes", () => ({
  ...jest.requireActual("../hooks/use-notes"),
  useStudentNotes: (...a: unknown[]) => mockNotes(...a),
}));

import { GroupedNotesTab, GroupedProfileTab } from "../design/students/grouped-tabs";
import { renderWithProviders } from "./helpers/render";

const LONG = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of a long pastoral note.`).join(" ");

describe("student page free text is read in full", () => {
  it("a long note body has no line cap, with the metadata and Follow up chip below it", () => {
    mockNotes.mockReturnValue({
      isPending: false,
      isError: false,
      hasNextPage: false,
      data: {
        pages: [
          {
            notes: [
              {
                id: 1, body: LONG, visibility: "LEADERS", followUpFlagged: true,
                createdAt: "2099-02-01T10:00:00.000Z", updatedAt: "2099-02-01T10:00:00.000Z", edited: false,
                authorId: 2, authorName: "Mina Mentor", authorRole: "MENTOR", seasonId: 7, seasonTitle: "Spring 2099", canEdit: false,
              },
            ],
            nextCursor: null,
          },
        ],
      },
    });
    renderWithProviders(<GroupedNotesTab studentId={21} canWriteNote={false} onWrite={() => {}} />);
    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(/Visible to group leaders only/).props.numberOfLines).toBeUndefined();
    expect(screen.getByText("Follow up")).toBeTruthy();
  });

  it("a long Gifts / interests value has no line cap", () => {
    renderWithProviders(
      <GroupedProfileTab
        profile={{ university: "Cairo", year: "3rd", gifts: LONG, activeSeasonId: 7, activeSeasonTitle: "S", activeSeasonCode: "S" } as never}
      />,
    );
    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
  });
});
