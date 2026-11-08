/**
 * The people picker's rows in every state: ticked, unticked, already passed,
 * in a role on a draft, blocked (with and without Override), overridden, and
 * someone who didn't finish the chosen season; its source picker; and the
 * group form's Members field, with people and with an empty season.
 * Fake data; the toggles only change this section's own ticks.
 */
import { useState } from "react";
import { View } from "react-native";
import type { PeopleCandidate } from "@space/shared";

import { ListSectionHeader } from "../../design/ui/grouped-list";
import { MembersField } from "../group-form/members-field";
import { CandidateRow } from "../season-people/candidate-row";
import type { SourceSeason } from "../season-people/source";
import { SourcePicker } from "../season-people/source-picker";
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
  places: [],
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
const SOURCE: SourceSeason = { id: 90, code: "gbv-2025", title: "GBV 2025", passed: 12, graduated: 2 };
const STRAGGLER: PeopleCandidate = {
  ...base,
  id: 9,
  name: "Fadi Wahba",
  last: { seasonTitle: "GBV 2025", outcome: "NOT_PASSED", attendancePct: 52 },
  places: [{ seasonId: 90, outcome: "not_passed" }],
};
const ROSTER = [
  { userId: 21, name: "Abanob Magdy", email: "a@example.com", groupId: 1, groupName: "Group 1" },
  { userId: 22, name: "Aiten Tarek", email: "b@example.com", groupId: null, groupName: null },
  { userId: 23, name: "Amir Samir", email: "c@example.com", groupId: 2, groupName: "Group 2" },
];

export function PeopleSection() {
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set([1]));
  const toggle = (id: number) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [source, setSource] = useState<SourceSeason | null>(SOURCE);
  const [members, setMembers] = useState<number[]>([21]);
  const row = { overridden: false, chosen: false, source: null, onOverride: noop } as const;
  return (
    <CatalogueSection id="people-rows" title="People picker rows">
      <SourcePicker
        sources={[SOURCE]}
        value={source}
        ticked={12}
        onChange={(id) => setSource(id === null ? null : SOURCE)}
      />
      <View className="overflow-hidden rounded-group">
        {FAKE.map((p) => (
          <CandidateRow key={p.id} {...row} person={p} selected={ticked.has(p.id)} onToggle={toggle} />
        ))}
        <ListSectionHeader className="px-4 pb-1.5 pt-5">Didn't finish GBV 2025</ListSectionHeader>
        <CandidateRow {...row} person={STRAGGLER} source={SOURCE} selected={ticked.has(9)} chosen={ticked.has(9)} onToggle={toggle} />
        <ListSectionHeader className="px-4 pb-1.5 pt-5">Did not pass</ListSectionHeader>
        {BLOCKED.map((p) => (
          <CandidateRow key={p.id} {...row} person={p} selected={false} onToggle={noop} />
        ))}
        <CandidateRow
          person={{ ...BLOCKED[0]!, id: 8, name: "Sara Nabil (overridden)" }}
          selected={ticked.has(8)}
          overridden
          chosen={false}
          source={null}
          onToggle={toggle}
          onOverride={noop}
        />
      </View>
      <MembersField roster={ROSTER} groupId={1} seasonTitle="GBV 2026" value={members} onChange={setMembers} status="ready" />
      <MembersField roster={[]} groupId={null} seasonTitle="GBV 2026" value={[]} onChange={noop} status="ready" onOpenSeason={noop} />
    </CatalogueSection>
  );
}
