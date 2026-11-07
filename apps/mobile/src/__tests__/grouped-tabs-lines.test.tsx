import { render, screen } from "@testing-library/react-native";
import type { NoteSummary } from "@space/shared";

import { GroupedNotesTab } from "../design/students/grouped-tabs";
import { StudentDetails } from "../design/students/student-details";

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

  it("a note's byline names the author's role in words, not the enum", () => {
    mockNotes.current = [
      {
        id: 1, body: "Body", visibility: "MENTORS", followUpFlagged: false,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", edited: false,
        authorId: 2, authorName: "Mina", authorRole: "MENTOR", seasonId: null, seasonTitle: null, canEdit: false,
      },
    ];
    render(<GroupedNotesTab studentId={1} canWriteNote={false} onWrite={() => {}} />);
    expect(screen.getByText(/Mina · Mentor ·/)).toBeTruthy();
  });

  it("a long profile value has no line cap", () => {
    render(
      <StudentDetails
        profile={{ university: "AUC", faculty: LONG, universityGraduationYear: null } as never}
      />,
    );
    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
  });
});

describe("Academic rows", () => {
  it("shows faculty and the university graduation year", () => {
    render(
      <StudentDetails
        profile={{ university: "AUC", faculty: "Engineering", universityGraduationYear: 2031 } as never}
      />,
    );
    expect(screen.getByText("Engineering")).toBeTruthy();
    expect(screen.getByText("2031")).toBeTruthy();
    expect(screen.getByText("Graduation year")).toBeTruthy();
  });

  it("no longer renders the dropped gifts or spiritual background rows", () => {
    render(
      <StudentDetails
        profile={{ university: "AUC", faculty: null, universityGraduationYear: null } as never}
      />,
    );
    expect(screen.queryByText("Gifts / interests")).toBeNull();
    expect(screen.queryByText("Spiritual background")).toBeNull();
  });
});

describe("Seasons row (M1)", () => {
  it("never cuts a long drop reason", () => {
    const { GroupedSeasonsTab } = jest.requireActual("../design/students/grouped-tabs");
    render(
      <GroupedSeasonsTab
        enrollments={[
          {
            enrollmentId: 1, seasonTitle: "Season", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-06-01T00:00:00.000Z",
            groupName: "G", dropReason: LONG, status: "WITHDRAWN", attendancePct: null,
          } as never,
        ]}
      />,
    );
    expect(screen.getByText(/Season/, { exact: true }).props.numberOfLines).toBe(2);
    expect(screen.getByText(new RegExp(LONG.trim().slice(0, 20))).props.numberOfLines).toBeUndefined();
  });

  it("keeps the group name in one piece so it cannot orphan its last word", () => {
    const { GroupedSeasonsTab } = jest.requireActual("../design/students/grouped-tabs");
    render(
      <GroupedSeasonsTab
        enrollments={[
          {
            enrollmentId: 1, seasonTitle: "Season", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-06-01T00:00:00.000Z",
            groupName: "Group A", dropReason: null, status: "ACTIVE", attendancePct: null,
          } as never,
        ]}
      />,
    );
    // getByText collapses whitespace, so read the raw string.
    const meta = screen.getByText(/Jan 1, 2026/);
    expect(meta.props.children).toContain("Group\u00a0A");
  });
});
