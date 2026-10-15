import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Users } from "lucide-react-native";
import { Text as RNText } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import { SectionCard } from "../design/dashboard/section-card";
import { BackLink } from "../design/layout/page-title";
import { RouteError } from "../design/layout/route-states";
import { Checkbox } from "../design/ui";
import { useGroupDetails } from "../hooks/use-groups";
import { useLedSeasonSessions } from "../hooks/use-sessions";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";

const get = apiClient.get as jest.Mock;

function asRole(role: "STUDENT" | "LEADER") {
  useSessionStore.setState({
    user: { id: 1, name: "U", email: "u@jpc.test", role, avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("RouteError", () => {
  it("tells a student to contact their leader", () => {
    asRole("STUDENT");
    render(<RouteError onRetry={jest.fn()} />);
    expect(screen.getByText(/let your leader know/)).toBeTruthy();
  });

  it("tells staff to contact an admin (v1 app/leader/error.tsx) and retries", () => {
    asRole("LEADER");
    const onRetry = jest.fn();
    render(<RouteError onRetry={onRetry} />);
    expect(screen.getByText(/let an admin know/)).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("BackLink", () => {
  it("renders the arrow-icon form", () => {
    const onPress = jest.fn();
    render(<BackLink icon label="Back to session" onPress={onPress} />);
    fireEvent.press(screen.getByText("Back to session"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("← Back to session")).toBeNull();
  });

  it("keeps the arrow-text form by default", () => {
    render(<BackLink label="Back" onPress={jest.fn()} />);
    expect(screen.getByText("← Back")).toBeTruthy();
  });
});

describe("SectionCard", () => {
  it("offers View all only when wired", () => {
    const onViewAll = jest.fn();
    const { rerender } = render(
      <SectionCard icon={Users} title="Your students" onViewAll={onViewAll}>
        <RNText>rows</RNText>
      </SectionCard>,
    );
    fireEvent.press(screen.getByLabelText("View all Your students"));
    expect(onViewAll).toHaveBeenCalledTimes(1);
    rerender(
      <SectionCard icon={Users} title="Your students">
        <RNText>rows</RNText>
      </SectionCard>,
    );
    expect(screen.queryByText("View all")).toBeNull();
  });
});

describe("Checkbox", () => {
  it("reports the toggled value and exposes its state", () => {
    const onChange = jest.fn();
    render(<Checkbox checked={false} onCheckedChange={onChange} accessibilityLabel="Flag" />);
    const box = screen.getByLabelText("Flag");
    expect(box.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("led-season hooks", () => {
  it("useGroupDetails asks for every group", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: {
            id: Number(url.split("/").pop()),
            name: "G",
            description: null,
            seasonId: 7,
            seasonCode: "S26",
            seasonTitle: "Spring",
            leaders: [],
            students: [],
            canManage: false,
          },
        },
      }),
    );
    const { result } = renderHook(() => useGroupDetails([3, 4]), { wrapper });
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/groups/3");
    expect(get).toHaveBeenCalledWith("/api/v1/groups/4");
  });

  it("useLedSeasonSessions merges every season's sessions in time order", async () => {
    const session = (id: number, seasonId: number, startsAt: string) => ({
      id,
      title: `S${id}`,
      startsAt,
      dayKey: startsAt.slice(0, 10),
      startTime: "20:00",
      durationMinutes: 90,
      location: null,
      recurrenceGroupId: null,
      attendanceMarked: false,
      seasonId,
      seasonCode: `S${seasonId}`,
      seasonTitle: `Season ${seasonId}`,
      checkInToken: null,
      checkInOpenAt: null,
      checkInClosedAt: null,
    });
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: {
            sessions: url.includes("/seasons/7/")
              ? [session(2, 7, "2099-03-08T18:00:00.000Z")]
              : [session(1, 8, "2099-03-01T18:00:00.000Z")],
          },
        },
      }),
    );
    const { result } = renderHook(() => useLedSeasonSessions([7, 8]), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/8/sessions");
    expect(result.current.sessions.map((s) => s.id)).toEqual([1, 2]);
  });
});
