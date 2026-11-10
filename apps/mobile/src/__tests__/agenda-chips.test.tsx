// Calendar Upcoming (sweep R5): the season tag and the status chip wrap under the title, never beside it.
import { screen, within } from "@testing-library/react-native";

import { AgendaView } from "../design/calendar/season-calendar-agenda";
import { buildSeasonColors } from "../design/calendar/season-colors";
import { renderWithProviders } from "./helpers/render";
import { session } from "./helpers/calendar-fixtures";

const s = session(1, "Week 2: Calendar", "2099-03-01T18:00:00.000Z", "2099-03-01");

it("puts the season tag and status chip in the row footer, with the chip's word spoken", () => {
  renderWithProviders(
    <AgendaView
      sessions={[s as never]}
      events={[]}
      today="2099-02-24"
      onOpenSession={() => undefined}
      onOpenEvent={() => undefined}
      seasonColors={buildSeasonColors([s])}
    />,
  );
  const footer = screen.getByTestId("list-row-footer");
  expect(within(footer).getByText("S26")).toBeTruthy();
  expect(within(footer).getByText("in 5 days")).toBeTruthy();
  expect(screen.getByLabelText(/Week 2: Calendar.*in 5 days$/)).toBeTruthy();
});
