import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { loginRequestSchema } from "@space/shared";

import { TestLoginForm } from "./helpers/TestLoginForm";

it("shows the schema's error and blocks submit", async () => {
  const onSubmit = jest.fn();
  render(<TestLoginForm schema={loginRequestSchema} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
  fireEvent.press(screen.getByText("Sign in"));
  // `Input` hides its error caption from the accessibility tree (it's already
  // surfaced via `accessibilityHint` on the field itself, so screen readers
  // don't get it twice). Asserting through the hint — the actual
  // screen-reader-visible surface — proves the error reaches users; a
  // `getByText(..., { includeHiddenElements: true })` assertion here would
  // also match the field's always-present visible label ("Email"), so it'd
  // pass even if `FormField` never surfaced the validation error at all.
  await waitFor(() =>
    expect(screen.getByLabelText("Email").props.accessibilityHint).toMatch(/email/i),
  );
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
