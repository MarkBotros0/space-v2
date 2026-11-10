// Rows whose text was cut with room to wrap (sweep R4): title/subtitle line caps.
import { screen } from "@testing-library/react-native";
import type { JpcEventListItem, SeasonListItem } from "@space/shared";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { SeasonsList } from "../screens/season/seasons-list";
import { NeedsActionList } from "../screens/staff-today/needs-action-list";
import { EventListRow } from "../screens/events/event-row";
import { GroupedList } from "../design/ui";
import { renderWithProviders } from "./helpers/render";

describe("row line caps", () => {
  it("lets a Home needs-action tile label take two lines", () => {
    renderWithProviders(
      <NeedsActionList
        needs={{ pendingReview: 1, unmarkedSessions: 0, atRisk: 0, pendingInvites: 0 }}
        scopeSeasonId={1}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByText("Essays to review").props.numberOfLines).toBe(2);
  });

  it("lets a season row's code and dates take three lines", () => {
    const row: SeasonListItem = {
      id: 1,
      code: "gbv-2026",
      title: "GBV 2026",
      program: "GBV",
      year: 2026,
      status: "ACTIVE",
      startDate: "2026-09-01",
      endDate: "2026-12-20",
    } as SeasonListItem;
    renderWithProviders(<SeasonsList rows={[row]} onOpen={() => undefined} />);
    expect(screen.getByText(/^gbv-2026 · /).props.numberOfLines).toBe(3);
  });

  it("lets an event title take three lines", () => {
    const event = {
      id: 3,
      title: "Alumni reunion dinner",
      date: "2099-06-30T21:00:00.000Z",
      endDate: null,
      dayKey: "2099-07-01",
      endDayKey: null,
      isPast: false,
      time: null,
      allDay: true,
      url: null,
      visibility: "ALUMNI_ONLY",
      seasonId: null,
      seasonCode: null,
    } as unknown as JpcEventListItem;
    renderWithProviders(
      <GroupedList>
        <EventListRow event={event} />
      </GroupedList>,
    );
    expect(screen.getByText("Alumni reunion dinner").props.numberOfLines).toBe(3);
  });
});
