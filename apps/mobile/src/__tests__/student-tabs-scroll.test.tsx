import { fireEvent, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(() => new Promise(() => {})), post: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

import { StudentDetailGrouped, tabScrollTarget } from "../design/students/student-detail-grouped";
import { renderWithProviders } from "./helpers/render";

describe("tabScrollTarget", () => {
  it("is null when the tab is fully visible", () => {
    expect(tabScrollTarget(20, 80, 0, 360)).toBeNull();
  });
  it("scrolls right just enough to show a tab clipped at the right edge", () => {
    expect(tabScrollTarget(300, 100, 0, 360)).toBe(300 + 100 + 16 - 360);
  });
  it("scrolls left to show a tab clipped at the left edge", () => {
    expect(tabScrollTarget(100, 80, 150, 360)).toBe(84);
  });
  it("never goes below 0 and ignores an unmeasured viewport", () => {
    expect(tabScrollTarget(4, 80, 10, 360)).toBe(0);
    expect(tabScrollTarget(300, 100, 0, 0)).toBeNull();
  });
});

describe("StudentDetailGrouped tab row", () => {
  it("scrolls a selected tab that is clipped into view", () => {
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, "scrollTo").mockImplementation(() => {});
    const student = {
      id: 21,
      name: "Sara",
      email: "s@jpc.test",
      avatarPath: null,
      graduationYear: null,
      currentGroup: null,
      enrollments: [],
      profile: { university: null, year: null, gifts: null, activeSeasonId: null, activeSeasonTitle: null, activeSeasonCode: null },
    } as never;
    renderWithProviders(<StudentDetailGrouped student={student} canWriteNote={false} />);
    const row = screen.UNSAFE_getAllByType(ScrollView).find((s) => s.props.horizontal)!;
    fireEvent(row, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 44 } } });
    fireEvent(screen.getByRole("tab", { name: "Notes" }), "layout", { nativeEvent: { layout: { x: 340, y: 0, width: 80, height: 44 } } });
    fireEvent.press(screen.getByRole("tab", { name: "Notes" }));
    expect(scrollTo).toHaveBeenCalledWith({ x: 340 + 80 + 16 - 360, animated: true });
    scrollTo.mockRestore();
  });

  it("measures from the real offset once a tab's layout changes mid-flight (font size change)", () => {
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, "scrollTo").mockImplementation(() => {});
    const student = {
      id: 21, name: "Sara", email: "s@jpc.test", avatarPath: null, graduationYear: null, currentGroup: null, enrollments: [],
      profile: { university: null, year: null, gifts: null, activeSeasonId: null, activeSeasonTitle: null, activeSeasonCode: null },
    } as never;
    renderWithProviders(<StudentDetailGrouped student={student} canWriteNote={false} />);
    const row = screen.UNSAFE_getAllByType(ScrollView).find((s) => s.props.horizontal)!;
    const lay = (x: number, width: number) => ({ nativeEvent: { layout: { x, y: 0, width, height: 44 } } });
    fireEvent(row, "layout", lay(0, 360));
    fireEvent(screen.getByRole("tab", { name: "Notes" }), "layout", lay(700, 80));
    fireEvent(screen.getByRole("tab", { name: "Submissions" }), "layout", lay(500, 100));
    fireEvent.press(screen.getByRole("tab", { name: "Notes" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 700 + 80 + 16 - 360, animated: true });
    // The font shrank: Submissions now sits near the start, while the row is still at offset 0.
    fireEvent(screen.getByRole("tab", { name: "Submissions" }), "layout", lay(300, 80));
    fireEvent.press(screen.getByRole("tab", { name: "Submissions" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 300 + 80 + 16 - 360, animated: true });
    scrollTo.mockRestore();
  });
});
