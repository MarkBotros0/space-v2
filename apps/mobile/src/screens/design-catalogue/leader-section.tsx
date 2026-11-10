import { View } from "react-native";

import { SessionHomeCard } from "../home/session-card";
import { Button } from "../../design/ui/button";
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
  const today = deviceTodayKey();
  const weekOut = new Date();
  weekOut.setDate(weekOut.getDate() + 5);
  return (
    <>
      {/* Every role's Home session card: plain until there is something to do now. */}
      <CatalogueSection id="session-home-card" title="Session card (Home)">
        <View className="gap-3">
          <SessionHomeCard session={{ ...session, dayKey: deviceTodayKey(weekOut) }} todayKey={today} />
          <SessionHomeCard
            session={{ ...session, isInProgress: true }}
            todayKey={today}
            action={(onBrand) => (
              <Button variant={onBrand ? "onHero" : "primary"} onPress={() => {}}>
                Mark attendance
              </Button>
            )}
          />
          <SessionHomeCard session={null} todayKey={today} />
        </View>
      </CatalogueSection>
      <CatalogueSection id="leader-today" title="Leader Today">
        <LeaderSessionSection session={session} checkIn={checkIn} />
      </CatalogueSection>
    </>
  );
}
