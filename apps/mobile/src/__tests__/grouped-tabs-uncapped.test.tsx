import { screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockNotes = jest.fn();
jest.mock("../hooks/use-notes", () => ({
  ...jest.requireActual("../hooks/use-notes"),
  useStudentNotes: (...a: unknown[]) => mockNotes(...a),
}));

const mockAttendance = jest.fn();
jest.mock("../hooks/use-students", () => ({
  ...jest.requireActual("../hooks/use-students"),
  useStudentAttendanceHistory: (...a: unknown[]) => mockAttendance(...a),
}));

import { GroupedAttendanceTab, GroupedNotesTab } from "../design/students/grouped-tabs";
import { StudentDetails } from "../design/students/student-details";
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
                id: 1,
                body: LONG,
                visibility: "LEADERS",
                followUpFlagged: true,
                createdAt: "2099-02-01T10:00:00.000Z",
                updatedAt: "2099-02-01T10:00:00.000Z",
                edited: false,
                authorId: 2,
                authorName: "Mina Mentor",
                authorRole: "MENTOR",
                seasonId: 7,
                seasonTitle: "Spring 2099",
                canEdit: false,
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

  it("a long Faculty value has no line cap", () => {
    renderWithProviders(
      <StudentDetails
        profile={
          {
            university: "Cairo",
            faculty: LONG,
            universityGraduationYear: 2027,
            activeSeasonId: 7,
            activeSeasonTitle: "S",
            activeSeasonCode: "S",
          } as never
        }
      />,
    );
    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
  });

  it("an attendance row's session title takes two lines beside its chip (M13)", () => {
    mockAttendance.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        history: [
          {
            sessionId: 1,
            sessionTitle: LONG,
            startsAt: "2099-04-01T16:00:00.000Z",
            seasonId: 7,
            seasonTitle: "Spring",
            status: "LATE",
          },
        ],
      },
    });
    renderWithProviders(<GroupedAttendanceTab studentId={21} />);
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
  });
});
