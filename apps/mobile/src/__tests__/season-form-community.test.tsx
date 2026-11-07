import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), dismissAll: jest.fn() }),
}));

import { SeasonsList } from "../design/seasons/seasons-list";
import { SeasonForm, NEW_SEASON_VALUES, type SeasonFormValues } from "../components/season/SeasonForm";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;

const valid: SeasonFormValues = {
  ...NEW_SEASON_VALUES,
  program: "GBV",
  year: "2026",
  code: "gbv-2026",
  startDay: "2026-01-01",
  endDay: "2026-12-31",
  requiredProgram: "BASE",
  graduatesOnPass: true,
};

const form = (over: Partial<SeasonFormValues> = {}, mode: "create" | "edit" = "edit", onSubmit = jest.fn()) => {
  renderWithProviders(
    <SeasonForm mode={mode} title="Season" initial={{ ...valid, ...over }} submitting={false} message={null} onSubmit={onSubmit} />,
  );
  return onSubmit;
};

const DESCRIPTION = "Everyone can take part as a student, alumni too. It runs alone: no other season can be active.";

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: [{ program: "BASE" }] } });
  useSessionStore.setState(makeSession("SUPER", {}, { id: 1 }));
});

describe("SeasonForm community-wide switch", () => {
  it("shows a switch with its description to a super on a draft", () => {
    form({ status: "DRAFT" });
    expect(screen.getByLabelText("Community-wide season")).toBeTruthy();
    expect(screen.getByText(DESCRIPTION)).toBeTruthy();
  });

  it("is not shown to anyone but a super", () => {
    useSessionStore.setState(makeSession("ADMIN", {}, { id: 2 }));
    form({ status: "DRAFT" });
    expect(screen.queryByLabelText("Community-wide season")).toBeNull();
    expect(screen.queryByText(DESCRIPTION)).toBeNull();
  });

  it("turning it on hides Graduating and Required program and sends them cleared", () => {
    const onSubmit = form({ status: "DRAFT" });
    expect(screen.getByLabelText("Graduating season")).toBeTruthy();
    expect(screen.getByLabelText("Required program")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Community-wide season"));
    expect(screen.queryByLabelText("Graduating season")).toBeNull();
    expect(screen.queryByLabelText("Required program")).toBeNull();
    fireEvent.press(screen.getByText("Save changes"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ isCommunityWide: true, graduatesOnPass: false, requiredProgram: null }),
    );
  });

  it("can't be changed once the season has started, and says so in words", () => {
    form({ status: "ACTIVE", isCommunityWide: false });
    expect(screen.queryByLabelText("Community-wide season")).toBeNull();
    expect(screen.getByText(/Community-wide season/)).toBeTruthy();
    expect(screen.getByText(/can't change now the season has started/)).toBeTruthy();
  });

  it("a started community-wide season keeps Graduating and Required program out of the form", () => {
    form({ status: "ACTIVE", isCommunityWide: true, graduatesOnPass: false, requiredProgram: "" });
    expect(screen.queryByLabelText("Graduating season")).toBeNull();
    expect(screen.queryByText("Required program")).toBeNull();
  });
});

describe("Community-wide chip", () => {
  it("shows on a list row in words, and not on a regular one", () => {
    const row = (id: number, isCommunityWide?: boolean) => ({
      id, code: `c-${id}`, title: `S${id}`, program: "P", year: 2026, status: "DRAFT" as const,
      startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z", isCommunityWide,
    });
    renderWithProviders(<SeasonsList rows={[row(1, true), row(2)]} onOpen={jest.fn()} />);
    expect(screen.getAllByText("Community-wide")).toHaveLength(1);
  });
});
