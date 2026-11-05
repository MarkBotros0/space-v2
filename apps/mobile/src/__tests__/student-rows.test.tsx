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
  year: null,
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

  it("joins university, year, season and group, and opens the student", () => {
    renderWithProviders(
      <GroupedList>
        <ActiveStudentRow
          item={{
            ...base,
            university: "Cairo University",
            year: "3rd",
            activeSeasonTitle: "Spring 2099",
            currentGroupName: "Group A",
          }}
        />
      </GroupedList>,
    );
    fireEvent.press(
      screen.getByLabelText("Sara Student, Cairo University · 3rd · Spring 2099 · Group A"),
    );
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });
});

describe("AlumnusRow", () => {
  it("says the class and university, or just the class", () => {
    renderWithProviders(
      <GroupedList>
        <AlumnusRow item={{ ...base, graduationYear: 2024, university: "AUC" }} />
        <AlumnusRow item={{ ...base, id: 22, name: "Aya", graduationYear: 2023 }} />
        <AlumnusRow item={{ ...base, id: 23, name: "Omar" }} />
      </GroupedList>,
    );
    expect(screen.getByLabelText("Sara Student, Class of 2024 · AUC")).toBeTruthy();
    expect(screen.getByLabelText("Aya, Class of 2023")).toBeTruthy();
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
