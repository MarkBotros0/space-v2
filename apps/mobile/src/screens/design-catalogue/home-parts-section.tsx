import { CalendarX, FileText, GraduationCap, TriangleAlert, Users } from "lucide-react-native";

import { CountGrid } from "../home/count-tile";
import { FigureGrid } from "../home/figure-tile";
import { PeoplePreview } from "../home/people-preview";
import { SeasonPulse, staffPulseFigures } from "../home/season-pulse";
import { CatalogueSection } from "./section";

const noop = () => {};

/** Home's parts: what is waiting (zeros step aside; all zero is one row), standing figures, the season pulse, a people preview. */
export function HomePartsSection() {
  return (
    <CatalogueSection id="home-parts" title="Home parts">
      <CountGrid
        tiles={[
          { label: "Submissions to review", value: 3, icon: FileText, tone: "info", onPress: noop },
          { label: "Sessions without attendance", value: 0, icon: CalendarX, tone: "warn", onPress: noop },
          { label: "Students at risk", value: 2, icon: TriangleAlert, tone: "bad", onPress: noop },
        ]}
      />
      <CountGrid tiles={[{ label: "Submissions to review", value: 0, icon: FileText, tone: "info", onPress: noop }]} />
      <FigureGrid
        tiles={[
          { label: "Students", value: "128", icon: Users, onPress: noop },
          { label: "Alumni", value: "54", icon: GraduationCap, onPress: noop },
        ]}
      />
      <SeasonPulse
        title="GBV 2026"
        progressPct={40}
        sessionsHeld={4}
        sessionsTotal={10}
        figures={staffPulseFigures(86, 24)}
        onPress={noop}
      />
      <SeasonPulse
        title="Spring Intensive 2026"
        progressPct={0}
        sessionsHeld={0}
        sessionsTotal={0}
        figures={staffPulseFigures(null, 3)}
      />
      <PeoplePreview
        header="Students at risk"
        people={[
          { id: 1, name: "Mina Adel", reason: "50% attendance" },
          { id: 2, name: "Sara Nabil", reason: "1 of 4 submitted" },
        ]}
        total={5}
        onOpen={noop}
        onSeeAll={noop}
      />
    </CatalogueSection>
  );
}
