import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";

import { useSessionStore } from "../store/session";
import { appContext, muteTabsAnchorWarning } from "./helpers/router-context";
import { makeScopes, makeUser } from "./helpers/session";

// Cold start on spacev2://checkin/<token>: the route sits outside (app), so
// "Go to Today" must have somewhere to land with nothing underneath it.

muteTabsAnchorWarning();

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn().mockRejectedValue(new Error("x")), post: jest.fn() } }));
jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

beforeEach(() => {
  useSessionStore.getState().clear();
  useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes());
});

it("a cold check-in link has Today to land on: Go to Today reaches /dashboard", async () => {
  const context = {
    ...appContext(),
    "checkin/[token]": require("../../app/checkin/[token]") as never,
  };
  const result = await renderRouter(context, { initialUrl: "/checkin/AbC123XyZ0" });
  expect(await screen.findByText("Go to Today")).toBeTruthy();
  expect(result.getPathname()).toBe("/checkin/AbC123XyZ0");

  await act(async () => fireEvent.press(screen.getByText("Go to Today")));
  expect(result.getPathname()).toBe("/dashboard");
  expect(await screen.findByText("screen:/dashboard")).toBeTruthy();
});
