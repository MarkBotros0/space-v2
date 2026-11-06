import { fireEvent, render, screen } from "@testing-library/react-native";

import { renderWithProviders } from "./helpers/render";
import {
  Combobox,
  DatePicker,
  FormField,
  Input,
  Modal,
  ModalContent,
  ModalTitle,
  MultiSelect,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TimePicker,
} from "../design/ui";

it("Input forwards typed text", () => {
  const onChangeText = jest.fn();
  render(<Input accessibilityLabel="Email" onChangeText={onChangeText} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "a@b.c");
  expect(onChangeText).toHaveBeenCalledWith("a@b.c");
});

it("Input shows v1's invalid border when aria-invalid", () => {
  render(<Input accessibilityLabel="Email" aria-invalid />);
  expect(screen.getByLabelText("Email").props.className).toContain("border-destructive");
});

it("PasswordInput toggles visibility with v1's labels", () => {
  render(<PasswordInput accessibilityLabel="Password" />);
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
  expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
});

it("Switch toggles", () => {
  const onCheckedChange = jest.fn();
  render(
    <Switch accessibilityLabel="Email me" checked={false} onCheckedChange={onCheckedChange} />,
  );
  fireEvent.press(screen.getByRole("switch"));
  expect(onCheckedChange).toHaveBeenCalledWith(true);
});

it("Switch tracks carry a 3:1 outline (off) and a teal 700 fill (on)", () => {
  const { rerender } = render(<Switch accessibilityLabel="Email me" checked={false} />);
  expect(screen.getByRole("switch").props.className).toContain("border-control-border");
  rerender(<Switch accessibilityLabel="Email me" checked />);
  expect(screen.getByRole("switch").props.className).toContain("bg-brand-teal-700");
});

it("Select (v1 compound API) shows the placeholder, opens and reports a choice", () => {
  const onValueChange = jest.fn();
  render(
    <Select items={{ a: "Group A", b: "Group B" }} value={null} onValueChange={onValueChange}>
      <SelectTrigger accessibilityLabel="Group">
        <SelectValue placeholder="Choose a group" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Group A</SelectItem>
        <SelectItem value="b">Group B</SelectItem>
      </SelectContent>
    </Select>,
  );
  expect(screen.queryByText("Group B")).toBeNull();
  fireEvent.press(screen.getByLabelText("Group"));
  fireEvent.press(screen.getByText("Group B"));
  expect(onValueChange).toHaveBeenCalledWith("b");
});

it("SelectValue shows the selected item's label from items", () => {
  render(
    <Select items={{ a: "Group A" }} value="a" onValueChange={() => {}}>
      <SelectTrigger accessibilityLabel="Group">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Group A</SelectItem>
      </SelectContent>
    </Select>,
  );
  expect(screen.getByLabelText("Group")).toHaveTextContent("Group A");
});

it("Combobox filters and shows v1's empty message", () => {
  const onChange = jest.fn();
  render(
    <Combobox
      accessibilityLabel="Student"
      value={null}
      onChange={onChange}
      options={[
        { value: "1", label: "Sara" },
        { value: "2", label: "Mina" },
      ]}
    />,
  );
  fireEvent.press(screen.getByLabelText("Student"));
  fireEvent.changeText(screen.getByPlaceholderText("Search…"), "zz");
  expect(screen.getByText("No matches.")).toBeTruthy();
  fireEvent.changeText(screen.getByPlaceholderText("Search…"), "mi");
  fireEvent.press(screen.getByText("Mina"));
  expect(onChange).toHaveBeenCalledWith("2");
});

it("MultiSelect toggles several options (v1 onChange)", () => {
  const onChange = jest.fn();
  render(
    <MultiSelect
      accessibilityLabel="Tags"
      value={["a"]}
      onChange={onChange}
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]}
    />,
  );
  fireEvent.press(screen.getByLabelText("Tags"));
  fireEvent.press(screen.getByText("Beta"));
  expect(onChange).toHaveBeenCalledWith(["a", "b"]);
});

it("DatePicker shows the app format (Oct 14, 2026) and picks a day", () => {
  const onChange = jest.fn();
  render(
    <DatePicker accessibilityLabel="Start" value={new Date(2026, 9, 14)} onChange={onChange} />,
  );
  expect(screen.getByLabelText("Start")).toHaveTextContent("Oct 14, 2026");
  fireEvent.press(screen.getByLabelText("Start"));
  expect(screen.getByText("October 2026")).toBeTruthy();
  fireEvent.press(screen.getByText("20"));
  expect(onChange.mock.calls[0][0].getDate()).toBe(20);
});

it("DatePicker weekday headers stay on one line and ignore font scaling (K4)", () => {
  render(
    <DatePicker accessibilityLabel="Start" value={new Date(2026, 9, 14)} onChange={() => {}} />,
  );
  fireEvent.press(screen.getByLabelText("Start"));
  const heads = screen.getAllByTestId("date-picker-weekday");
  expect(heads).toHaveLength(7);
  for (const h of heads) {
    expect(h.props.numberOfLines).toBe(1);
    expect(h.props.maxFontSizeMultiplier).toBe(1);
  }
});

it("DatePicker jumps to a far year through the title: years, then month, then day", () => {
  const onChange = jest.fn();
  render(
    <DatePicker
      accessibilityLabel="Date of birth"
      value={new Date(2026, 9, 14)}
      onChange={onChange}
    />,
  );
  fireEvent.press(screen.getByLabelText("Date of birth"));
  fireEvent.press(screen.getByLabelText("October 2026, choose month and year"));
  expect(screen.getByText("2016 – 2027")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Earlier years"));
  fireEvent.press(screen.getByLabelText("Earlier years"));
  expect(screen.getByText("1992 – 2003")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("1999"));
  fireEvent.press(screen.getByLabelText("April 1999"));
  expect(screen.getByText("April 1999")).toBeTruthy();
  fireEvent.press(screen.getByText("5"));
  const picked: Date = onChange.mock.calls[0][0];
  expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([1999, 3, 5]);
});

it('DatePicker startWith="year" opens an empty field on the year grid', () => {
  render(
    <DatePicker
      accessibilityLabel="Date of birth"
      value={null}
      onChange={() => {}}
      startWith="year"
    />,
  );
  fireEvent.press(screen.getByLabelText("Date of birth"));
  expect(screen.getByTestId("date-picker-years")).toBeTruthy();
});

it("TimePicker shows padded hour and minute", () => {
  render(<TimePicker value={{ hour: 9, minute: 5 }} onChange={() => {}} />);
  expect(screen.getByText("09")).toBeTruthy();
  expect(screen.getByText("05")).toBeTruthy();
});

it("FormField shows label, required star and error", () => {
  render(
    <FormField label="Title" required error="Required">
      <Input accessibilityLabel="Title" />
    </FormField>,
  );
  // The star is a nested Text inside the label, as v1's <span> is.
  expect(screen.getByText("Title *")).toBeTruthy();
  expect(screen.getByText("Required")).toBeTruthy();
});

it("Modal renders its content as a sheet with a Close button", () => {
  const onOpenChange = jest.fn();
  renderWithProviders(
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalTitle>Edit group</ModalTitle>
      </ModalContent>
    </Modal>,
  );
  expect(screen.getByText("Edit group")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("Label has a real line height, so descenders in 'graduation year' are not clipped (K6)", () => {
  render(<FormField label="JPCS graduation year" required />);
  const label = screen.getByText(/JPCS graduation year/);
  expect(label.props.className).toContain("leading-5");
  expect(label.props.className).not.toContain("leading-none");
});
