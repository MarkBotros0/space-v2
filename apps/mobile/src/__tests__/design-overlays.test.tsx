import { fireEvent, render, screen } from "@testing-library/react-native";

import { ConfirmDialog, Modal, ModalContent, ModalTitle } from "../design/ui";

it("Modal renders content only when open and closes on backdrop press", () => {
  const onOpenChange = jest.fn();
  const { rerender } = render(
    <Modal open={false} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalTitle>Edit group</ModalTitle>
      </ModalContent>
    </Modal>,
  );
  expect(screen.queryByText("Edit group")).toBeNull();
  rerender(
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalTitle>Edit group</ModalTitle>
      </ModalContent>
    </Modal>,
  );
  expect(screen.getByText("Edit group")).toBeTruthy();
  fireEvent.press(screen.getByTestId("modal-backdrop"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("ConfirmDialog calls onConfirm and not on cancel (v1 defaults)", () => {
  const onConfirm = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <ConfirmDialog
      open
      title="Delete note?"
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />,
  );
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
