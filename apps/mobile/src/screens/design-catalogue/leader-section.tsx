import { LeaderSessionSection } from "../leader-today/session-section";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { CatalogueSection } from "./section";

/** The leader's session block in its day-of state: fake data, nothing saved. */
export function LeaderSection() {
  const session = {
    id: 1,
    title: "Week 6: Reading and discussion",
    startsAt: new Date().toISOString(),
    dayKey: deviceTodayKey(),
    time: "18:30",
    durationMinutes: 90,
    location: "Room 2",
    youtubeUrl: null,
    isInProgress: false,
  };
  const checkIn = {
    sessionId: 1,
    total: 9,
    present: 3,
    late: 1,
    absent: 0,
    notCheckedIn: ["Amira Hassan", "Omar Khaled", "Mona Samir", "Youssef Adel", "Layla Mostafa", "Karim Nabil"].map(
      (name, i) => ({ id: i + 1, name }),
    ),
  };
  return (
    <CatalogueSection id="leader-today" title="Leader Today">
      <LeaderSessionSection session={session} checkIn={checkIn} />
    </CatalogueSection>
  );
}
