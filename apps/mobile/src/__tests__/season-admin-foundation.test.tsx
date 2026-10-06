import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { z } from "zod";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { apiErrorCode } from "../lib/api-error";
import { firstErrorByField } from "../lib/form-errors";
import { parsePositiveInt } from "../lib/params";
import { useStaffSeasonSelection } from "../hooks/use-season-selection";
import { SeasonSwitcher } from "../components/SeasonSwitcher";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const row = (id: number, startDate: string, status: "DRAFT" | "ACTIVE") => ({
  id, code: `s${id}`, title: `Season ${id}`, program: "TEST", year: 2099, status,
  startDate, endDate: "2099-12-31T00:00:00.000Z",
});

beforeEach(() => jest.clearAllMocks());

describe("apiErrorCode", () => {
  it("returns the envelope's code, or null when there is none", () => {
    const err = Object.assign(new Error("409"), {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "has_student_records", message: "m" } } },
    });
    expect(apiErrorCode(err)).toBe("has_student_records");
    expect(apiErrorCode(new Error("boom"))).toBeNull();
  });
});

describe("firstErrorByField", () => {
  it("keys each issue by its LAST path segment and keeps the first", () => {
    const schema = z.object({ title: z.string().min(2), start: z.object({ time: z.string().regex(/^\d\d:\d\d$/) }) });
    const parsed = schema.safeParse({ title: "x", start: { time: "8pm" } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = firstErrorByField(parsed.error);
      expect(Object.keys(errors).sort()).toEqual(["time", "title"]);
    }
  });
});

describe("parsePositiveInt", () => {
  it("accepts a positive integer string only", () => {
    expect(parsePositiveInt("7")).toBe(7);
    expect(parsePositiveInt(["8", "9"])).toBe(8);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("7a")).toBeNull();
    expect(parsePositiveInt(undefined)).toBeNull();
  });
});

describe("useStaffSeasonSelection", () => {
  it("defaults to pickCurrentSeasonId, switches on request, and ignores an unknown id", async () => {
    get.mockResolvedValue({
      data: { data: { seasons: [row(8, "2099-09-01T00:00:00.000Z", "DRAFT"), row(7, "2099-02-01T00:00:00.000Z", "ACTIVE")] } },
    });
    const { result } = renderHook(() => useStaffSeasonSelection(true), { wrapper });
    await waitFor(() => expect(result.current.seasonId).toBe(7));
    act(() => result.current.setSeasonId(8));
    expect(result.current.seasonId).toBe(8);
    expect(result.current.season?.code).toBe("s8");
    act(() => result.current.setSeasonId(999));
    expect(result.current.seasonId).toBe(7);
  });

  it("fetches nothing when disabled", () => {
    const { result } = renderHook(() => useStaffSeasonSelection(false), { wrapper });
    expect(result.current).toMatchObject({ seasonId: null, isPending: false });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("SeasonSwitcher", () => {
  it("renders one chip per season and reports a press", () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <SeasonSwitcher
        seasons={[row(7, "2099-02-01T00:00:00.000Z", "ACTIVE"), row(8, "2099-09-01T00:00:00.000Z", "DRAFT")]}
        selectedId={7}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getByText("Season 8"));
    expect(onSelect).toHaveBeenCalledWith(8);
  });

  it("renders nothing when there is nothing to switch between", () => {
    renderWithProviders(
      <SeasonSwitcher seasons={[row(7, "2099-02-01T00:00:00.000Z", "ACTIVE")]} selectedId={7} onSelect={jest.fn()} />,
    );
    expect(screen.queryByText("Season 7")).toBeNull();
  });
});
