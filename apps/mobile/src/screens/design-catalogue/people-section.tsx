/**
 * The people picker's rows in every state: ticked, unticked, already passed,
 * in a role on a draft, blocked (with and without Override), and overridden.
 * Fake data; the toggles only change this section's own ticks.
 */
import { useState } from "react";
import { View } from "react-native";
import type { PeopleCandidate } from "@space/shared";

import { ListSectionHeader } from "../../design/ui/grouped-list";
import { CandidateRow } from "../season-people/candidate-row";
import { CatalogueSection } from "./section";

const base: PeopleCandidate = {
  id: 0,
  name: "",
  last: { seasonTitle: "GBV 2026", outcome: "PASSED", attendancePct: 88 },
  availability: "available",
  reason: null,
  selectable: true,
  pool: "student",
  overridable: false,
};
const FAKE: PeopleCandidate[] = [
  { ...base, id: 1, name: "Peter Samy" },
  { ...base, id: 2, name: "Nour Hany", last: { seasonTitle: "GBV 2026", outcome: "PASSED", attendancePct: 95 } },
  { ...base, id: 3, name: "Hala Fouad", availability: "already_passed", reason: "Already passed GBV 2026" },
  { ...base, id: 4, name: "Dina Said", availability: "in_role", reason: "Leading a group in GBV 2026" },
];
const BLOCKED: PeopleCandidate[] = [
  {
    ...base,
    id: 5,
    name: "Sara Nabil",
    last: { seasonTitle: "GBV 2026", outcome: "NOT_PASSED", attendancePct: 40 },
    availability: "did_not_pass",
    reason: "Did not pass GBV 2026",
    selectable: false,
    overridable: true,
  },
  {
    ...base,
    id: 6,
    name: "Karim Adel",
    last: null,
    availability: "never_finished",
    reason: "Hasn't finished GBV yet",
    selectable: false,
  },
  {
    ...base,
    id: 7,
    name: "Mina Adel with a long name that has to wrap onto a second line",
    availability: "in_role",
    reason: "Leading a group in GBV 2026",
    selectable: false,
  },
];

const noop = () => {};

export function PeopleSection() {
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set([1]));
  const toggle = (id: number) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <CatalogueSection id="people-rows" title="People picker rows">
      <View className="overflow-hidden rounded-group">
        {FAKE.map((p) => (
          <CandidateRow key={p.id} person={p} selected={ticked.has(p.id)} overridden={false} onToggle={toggle} onOverride={noop} />
        ))}
        <ListSectionHeader className="px-4 pb-1.5 pt-5">Did not pass</ListSectionHeader>
        {BLOCKED.map((p) => (
          <CandidateRow key={p.id} person={p} selected={false} overridden={false} onToggle={noop} onOverride={noop} />
        ))}
        <CandidateRow
          person={{ ...BLOCKED[0]!, id: 8, name: "Sara Nabil (overridden)" }}
          selected={ticked.has(8)}
          overridden
          onToggle={toggle}
          onOverride={noop}
        />
      </View>
    </CatalogueSection>
  );
}
