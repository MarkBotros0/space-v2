import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { get, organisation } from "./helpers/dashboard-fixtures";
import { seasonFixture, serveStaff, sessionRow, staffRoutes } from "./helpers/staff-today-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

const base = () =>
  staffRoutes({
    "/api/v1/reports/organisation": organisation,
    "/api/v1/users/invites/pending": { pending: 5 },
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("Super Today", () => {
  it("greets the super by first name, and falls back to Today when the name is blank", async () => {
    useSessionStore.setState(makeSession("SUPER", {}, { name: "Sam Super" }));
    serveStaff(get, { table: base() });
    const first = renderWithProviders(<DashboardScreen />);
    expect((await screen.findAllByText("Hi, Sam")).length).toBeGreaterThan(0);
    first.unmount();

    useSessionStore.setState(makeSession("SUPER", {}, { name: "" }));
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);
    expect((await screen.findAllByText("Home")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Hi,/)).toBeNull();
  });

  it("shows the action rows with no season on the review, sessions or at-risk destinations", async () => {
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("3 submissions waiting for review")).toBeTruthy();
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);
    fireEvent.press(screen.getByText("3 submissions waiting for review"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submissions", params: {} });
    fireEvent.press(screen.getByText("1 session with no attendance"));
    expect(mockPush).toHaveBeenCalledWith("/attention/sessions");
    fireEvent.press(screen.getByText("2 students at risk"));
    expect(mockPush).toHaveBeenCalledWith("/attention/at-risk");
  });

  it("the invites row opens pending users with no season id, and is absent at zero", async () => {
    serveStaff(get, { table: base() });
    const first = renderWithProviders(<DashboardScreen />);
    fireEvent.press(await screen.findByText("5 people not invited yet"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/users", params: { status: "pending" } });
    first.unmount();

    serveStaff(get, { table: { ...base(), "/api/v1/users/invites/pending": { pending: 0 } } });
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText("3 submissions waiting for review")).toBeTruthy();
    expect(screen.queryByText(/not invited yet/)).toBeNull();
  });

  it("two sessions live at once are both visible", async () => {
    serveStaff(get, {
      table: {
        ...base(),
        "/api/v1/seasons": { seasons: [seasonFixture(7), seasonFixture(8)] },
        "/api/v1/seasons/7/sessions": { sessions: [sessionRow(1, 7, 30)] },
        "/api/v1/seasons/8/sessions": { sessions: [sessionRow(2, 8, 10)] },
      },
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Happening now")).toBeTruthy();
    expect(screen.getByText("ALSO HAPPENING NOW")).toBeTruthy();
    expect(screen.getByText("Week 1")).toBeTruthy();
    expect(screen.getByText("Week 2")).toBeTruthy();
    fireEvent.press(screen.getByText("Mark attendance"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "1" } });
  });

  it("no active seasons still shows the figures and the events", async () => {
    serveStaff(get, {
      table: { ...base(), "/api/v1/seasons": { seasons: [seasonFixture(7, "ARCHIVED")] } },
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("40")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Seasons")).toBeTruthy();
    expect(await screen.findByText("9")).toBeTruthy();
    expect(screen.getByText("Open day")).toBeTruthy();
    expect(screen.queryByText("Happening now")).toBeNull();
  });

  it("the figure rows speak their count with the title", async () => {
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByRole("button", { name: "Alumni, 12" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Students (not graduated), 40" })).toBeTruthy();
  });

  it("the figure rows open what the old stat cards opened", async () => {
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);

    fireEvent.press(await screen.findByText("Alumni"));
    expect(mockPush).toHaveBeenCalledWith("/students/alumni");
    fireEvent.press(screen.getByText("Students (not graduated)"));
    expect(mockPush).toHaveBeenCalledWith("/students");
    fireEvent.press(screen.getByText("Seasons"));
    expect(mockPush).toHaveBeenCalledWith("/seasons");
    expect(screen.getByText(/All statuses/)).toBeTruthy();
    expect(screen.getByText(/From today, next 12 months/)).toBeTruthy();
    fireEvent.press(await screen.findByText("From today, next 12 months"));
    expect(mockPush).toHaveBeenCalledWith("/events");
  });
});
