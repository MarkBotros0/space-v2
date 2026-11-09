/**
 * The Start checklist's issue list in every state: all three seats, a reason
 * with Open (another season), Override (a program block) and a leader's
 * "Open season". Fake data; the actions do nothing.
 */
import type { StartIssue } from "@space/shared";

import { IssueList } from "../season-start/issue-list";
import { CatalogueSection } from "./section";

const issue = (over: Partial<StartIssue>): StartIssue => ({
  userId: 0,
  name: "",
  seat: "student",
  reason: "already_in_role",
  message: "",
  otherSeasonCode: null,
  ...over,
});
const ITEMS: StartIssue[] = [
  issue({
    userId: 1,
    name: "Mina Adel",
    message: "Mina Adel is already a student in GBV 2026",
    otherSeasonCode: "gbv-2026",
  }),
  issue({ userId: 2, name: "Sara Nabil", reason: "did_not_pass", message: "Sara Nabil did not pass GBV 2026" }),
  issue({
    userId: 3,
    name: "Karim Adel with a long name that has to wrap",
    reason: "never_finished",
    message: "Karim hasn't finished GBV yet",
  }),
  issue({
    userId: 4,
    name: "Dina Said",
    seat: "leader",
    reason: "leader_has_group",
    message: "Dina Said is already leading a group in GBV 2026",
  }),
  issue({ userId: 5, name: "Hany Fawzy", seat: "admin", reason: "is_alumnus", message: "Hany Fawzy is an alumnus" }),
];
const noop = () => {};

export function StartIssuesSection() {
  return (
    <CatalogueSection id="start-issues" title="Start checklist issues">
      <IssueList
        items={ITEMS}
        seasonsInTheWay={[
          { id: 3, code: "3g-2026", title: "3G 2026", message: "3G 2026 is still running. End it first." },
        ]}
        actions={{
          seasonCode: "gbv-2027",
          seasonTitle: "GBV 2027",
          busy: false,
          onRemove: noop,
          onOpenSeason: noop,
          onOverride: noop,
        }}
      />
    </CatalogueSection>
  );
}
