import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ConfirmDialog, Modal, ModalContent, ModalTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../design/ui";

it("Modal renders content only when open and closes on backdrop press", () => {
  const onOpenChange = jest.fn();
  const { rerender } = render(
    <Modal open={false} onOpenChange={onOpenChange}>
      <ModalContent><ModalTitle>Edit group</ModalTitle></ModalContent>
    </Modal>,
  );
  expect(screen.queryByText("Edit group")).toBeNull();
  rerender(
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent><ModalTitle>Edit group</ModalTitle></ModalContent>
    </Modal>,
  );
  expect(screen.getByText("Edit group")).toBeTruthy();
  fireEvent.press(screen.getByTestId("modal-backdrop"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("ConfirmDialog calls onConfirm and not on cancel (v1 defaults)", () => {
  const onConfirm = jest.fn();
  const onOpenChange = jest.fn();
  render(<ConfirmDialog open title="Delete note?" confirmLabel="Delete" destructive onConfirm={onConfirm} onOpenChange={onOpenChange} />);
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("ConfirmDialog shows v1's pending label and disables both buttons", () => {
  render(<ConfirmDialog open pending title="Delete note?" onConfirm={() => {}} onOpenChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Working…" }).props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByRole("button", { name: "Cancel" }).props.accessibilityState).toMatchObject({ disabled: true });
});

it("Tabs switch content", () => {
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Upcoming</TabsTrigger>
        <TabsTrigger value="b">Past</TabsTrigger>
      </TabsList>
      <TabsContent value="a"><Text>upcoming list</Text></TabsContent>
      <TabsContent value="b"><Text>past list</Text></TabsContent>
    </Tabs>,
  );
  expect(screen.getByText("upcoming list")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Upcoming" }).props.accessibilityState).toMatchObject({ selected: true });
  fireEvent.press(screen.getByRole("tab", { name: "Past" }));
  expect(screen.getByText("past list")).toBeTruthy();
  expect(screen.queryByText("upcoming list")).toBeNull();
});
