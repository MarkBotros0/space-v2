import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { loginRequestSchema } from "@space/shared";

import { TestLoginForm } from "./helpers/TestLoginForm";

it("shows the schema's error and blocks submit", async () => {
  const onSubmit = jest.fn();
  render(<TestLoginForm schema={loginRequestSchema} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
  fireEvent.press(screen.getByText("Sign in"));
  // FormField hands its error to the control as `accessibilityHint` (the
  // app's convention for announcing field errors), so the hint is what a
  // screen reader hears; asserting on it proves the validation message
  // reaches the field itself; the visible caption carries the same text.
  await waitFor(() =>
    expect(screen.getByLabelText("Email").props.accessibilityHint).toMatch(/email/i),
  );
  expect(screen.getByText(screen.getByLabelText("Email").props.accessibilityHint)).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});

it("submits parsed values when valid", async () => {
  const onSubmit = jest.fn();
  render(<TestLoginForm schema={loginRequestSchema} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "a@b.test");
  fireEvent.changeText(screen.getByLabelText("Password"), "secret");
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.test", password: "secret" }),
  );
});
