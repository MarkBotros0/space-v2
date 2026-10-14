import { fireEvent, render, screen } from "@testing-library/react-native";

import { renderWithProviders } from "./helpers/render";
import {
  ChipInput,
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
  render(<Switch accessibilityLabel="Email me" checked={false} onCheckedChange={onCheckedChange} />);
  fireEvent.press(screen.getByRole("switch"));
  expect(onCheckedChange).toHaveBeenCalledWith(true);
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
      options={[{ value: "1", label: "Sara" }, { value: "2", label: "Mina" }]}
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
      options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]}
    />,
  );
  fireEvent.press(screen.getByLabelText("Tags"));
  fireEvent.press(screen.getByText("Beta"));
  expect(onChange).toHaveBeenCalledWith(["a", "b"]);
});

it("ChipInput adds on submit and removes on ×", () => {
  const onChange = jest.fn();
  render(<ChipInput accessibilityLabel="Emails" value={["x"]} onChange={onChange} />);
  fireEvent.changeText(screen.getByLabelText("Emails"), "y");
  fireEvent(screen.getByLabelText("Emails"), "submitEditing");
  expect(onChange).toHaveBeenCalledWith(["x", "y"]);
  fireEvent.press(screen.getByLabelText("Remove x"));
  expect(onChange).toHaveBeenCalledWith([]);
});

it("DatePicker shows v1's PPP format and picks a day", () => {
  const onChange = jest.fn();
  render(<DatePicker accessibilityLabel="Start" value={new Date(2026, 9, 14)} onChange={onChange} />);
  expect(screen.getByLabelText("Start")).toHaveTextContent("October 14th, 2026");
  fireEvent.press(screen.getByLabelText("Start"));
  expect(screen.getByText("October 2026")).toBeTruthy();
  fireEvent.press(screen.getByText("20"));
  expect(onChange.mock.calls[0][0].getDate()).toBe(20);
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
