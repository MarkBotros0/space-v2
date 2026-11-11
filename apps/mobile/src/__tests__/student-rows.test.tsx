import { fireEvent, screen } from "@testing-library/react-native";
import type { StudentListItem } from "@space/shared";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { GroupedList } from "../design/ui";
import { ActiveStudentRow, AlumnusRow, DroppedStudentRow } from "../screens/students-list/student-rows";
import { renderWithProviders } from "./helpers/render";

const base: StudentListItem = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  university: null,
  faculty: null,
  universityGraduationYear: null,
  graduationYear: null,
  activeSeasonTitle: null,
  currentGroupName: null,
  droppedEnrollment: null,
};

beforeEach(() => jest.clearAllMocks());

describe("ActiveStudentRow", () => {
  it("shows name and email only when university, season and group are missing", () => {
    renderWithProviders(
      <GroupedList>
        <ActiveStudentRow item={base} />
      </GroupedList>,
    );
    expect(screen.getByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("sara@jpc.test")).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it("names the season, group and university, and opens the student", () => {
    renderWithProviders(
      <GroupedList>
        <ActiveStudentRow
          item={{
            ...base,
            university: "Cairo University",
            faculty: "Engineering",
            activeSeasonTitle: "Spring 2099",
            currentGroupName: "Group A",
          }}
        />
      </GroupedList>,
    );
    fireEvent.press(screen.getByLabelText("Sara Student, Spring 2099 · Group A · Cairo University"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });
});

describe("AlumnusRow", () => {
  it("says the class as JPCS-YY, never the university or faculty", () => {
    renderWithProviders(
      <GroupedList>
        <AlumnusRow item={{ ...base, graduationYear: 2024, university: "AUC", faculty: "Engineering" }} />
        <AlumnusRow item={{ ...base, id: 22, name: "Aya", graduationYear: 2005 }} seasonless />
        <AlumnusRow item={{ ...base, id: 23, name: "Omar" }} />
      </GroupedList>,
    );
    expect(screen.getByLabelText("Sara Student, JPCS-24")).toBeTruthy();
    expect(screen.getByLabelText("Aya, JPCS-05")).toBeTruthy();
    expect(screen.getByLabelText("Omar")).toBeTruthy();
  });
});

describe("DroppedStudentRow", () => {
  const dropped = (reason: string | null) => ({
    ...base,
    droppedEnrollment: {
      enrollmentId: 900,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      droppedAt: "2099-06-01T00:00:00.000Z",
      dropReason: reason,
    },
  });

  it("joins season, date and reason without dangling separators", () => {
    renderWithProviders(
      <GroupedList>
        <DroppedStudentRow item={dropped("Moved away")} />
        <DroppedStudentRow item={{ ...dropped(null), id: 30, name: "Dina" }} />
      </GroupedList>,
    );
    expect(screen.getByText(/^Dropped from Spring 2099 · .+ · Moved away$/)).toBeTruthy();
    expect(screen.getByText(/^Dropped from Spring 2099 · [^·]+$/)).toBeTruthy();
  });
});
