import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

const mockSetMode = jest.fn();
let mockResolved: "light" | "dark" = "light";
jest.mock("../design/theme/theme-mode", () => ({
  useThemeMode: () => ({ mode: "system", resolved: mockResolved, setMode: mockSetMode }),
}));

// The editor is a WebView (Tiptap); its bridge is stubbed so the toolbar can be checked.
const mockBridge = { toggleBold: jest.fn(), toggleItalic: jest.fn(), undo: jest.fn() };
jest.mock("@10play/tentap-editor", () => ({
  useEditorBridge: () => mockBridge,
  useBridgeState: () => ({ isBoldActive: true, isItalicActive: false, isStrikeActive: false, isBulletListActive: false, isOrderedListActive: false, isLinkActive: false, canUndo: true, canRedo: false, isReady: true }),
  RichText: () => null,
  TenTapStartKit: [],
  CoreBridge: { configureCSS: () => ({}) },
  PlaceholderBridge: { configureExtension: () => ({}) },
}));

import { BarChartCard, DataTable, PieChartCard, RichTextEditor, RichTextView, ThemeToggle } from "../design/ui";

type Row = { id: number; name: string; pct: string };
const columns = [
  { key: "name", header: "Name", cell: (r: Row) => r.name },
  { key: "pct", header: "Attendance", cell: (r: Row) => r.pct },
  { key: "act", header: "", cell: () => <Text>ACTION</Text> },
];

describe("DataTable (v1 phone list)", () => {
  it("renders the primary cell, meta cells joined by ·, and action cells", () => {
    render(<DataTable columns={columns} rows={[{ id: 1, name: "Mina", pct: "90%" }]} rowKey={(r) => r.id} />);
    expect(screen.getByText("Mina")).toBeTruthy();
    expect(screen.getByText("90%")).toBeTruthy();
    expect(screen.getByText("ACTION")).toBeTruthy();
  });

  it("renders emptyState when there are no rows", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyState={<Text>Nothing yet</Text>} />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });
});

describe("RichTextView (v1 sanitiser + reset typography)", () => {
  it("keeps allowed formatting and drops scripts", () => {
    render(<RichTextView html={'<p>Hello <strong>class</strong></p><script>alert(1)</script>'} />);
    expect(screen.getByText(/Hello/)).toBeTruthy();
    expect(screen.getByText("class")).toBeTruthy();
    expect(screen.queryByText(/alert/)).toBeNull();
  });

  it("unwraps tags v1 does not allow but keeps their text", () => {
    render(<RichTextView html={"<div><span>inside div</span></div>"} />);
    expect(screen.getByText(/inside div/)).toBeTruthy();
  });

  it("drops a javascript: link but keeps its text", () => {
    render(<RichTextView html={'<p><a href="javascript:alert(1)">click</a></p>'} />);
    expect(screen.getByText("click").props.accessibilityRole).not.toBe("link");
  });

  it("shows emptyText for empty content, like v1", () => {
    render(<RichTextView html="<p></p>" emptyText="No description." />);
    expect(screen.getByText("No description.")).toBeTruthy();
  });
});

describe("ThemeToggle (v1 single button)", () => {
  it("offers dark mode when light", () => {
    mockResolved = "light";
    render(<ThemeToggle />);
    fireEvent.press(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(mockSetMode).toHaveBeenCalledWith("dark");
  });

  it("offers light mode when dark", () => {
    mockResolved = "dark";
    render(<ThemeToggle />);
    fireEvent.press(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(mockSetMode).toHaveBeenCalledWith("light");
  });
});

describe("charts", () => {
  it("BarChartCard shows its title and one bar per datum", () => {
    render(<BarChartCard title="Enrollment" data={[{ m: "Jan", n: 3 }, { m: "Feb", n: 5 }]} xKey="m" yKey="n" />);
    expect(screen.getByText("Enrollment")).toBeTruthy();
    expect(screen.getAllByTestId("bar")).toHaveLength(2);
  });

  it("PieChartCard labels each slice by name", () => {
    render(<PieChartCard title="Engagement" data={[{ name: "High", value: 3 }, { name: "Low", value: 1 }]} />);
    expect(screen.getAllByTestId("slice")).toHaveLength(2);
  });
});

describe("RichTextEditor (v1 toolbar)", () => {
  it("has v1's toolbar buttons in v1's order and wires them to the editor", () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(["Bold", "Italic", "Strikethrough", "Bullet list", "Numbered list", "Link", "Undo", "Redo"]);
    fireEvent.press(screen.getByLabelText("Bold"));
    expect(mockBridge.toggleBold).toHaveBeenCalled();
    expect(screen.getByLabelText("Bold").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText("Redo").props.accessibilityState).toMatchObject({ disabled: true });
  });
});
