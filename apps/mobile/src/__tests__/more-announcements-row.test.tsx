import { screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../hooks/use-session", () => ({ useLogout: () => jest.fn() }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { ok } from "./helpers/announcements";

import MoreScreen from "../../app/(app)/(tabs)/more";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));
});

describe("More: Announcements row", () => {
  it("carries the unread count in its label", async () => {
    get.mockReturnValue(ok({ count: 2, latest: null }));
    renderWithProviders(<MoreScreen />);
    await waitFor(() => expect(screen.getByLabelText("Announcements, 2 unread")).toBeTruthy());
    expect(screen.getByText("2 new")).toBeTruthy();
  });

  it("has a plain label and no pill with nothing unread", async () => {
    get.mockReturnValue(ok({ count: 0, latest: null }));
    renderWithProviders(<MoreScreen />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.getByLabelText("Announcements")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
