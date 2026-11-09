import { View } from "react-native";
import type { SeasonStartCheck, StartIssue } from "@space/shared";

import { Button, EmptyState, GroupedList, Text } from "../../design/ui";

/** Reasons a super may overrule (a program block). Everything else is fixed by removing or changing the person. */
const OVERRIDABLE: ReadonlySet<StartIssue["reason"]> = new Set(["did_not_pass", "never_finished"]);

const SEATS: { seat: StartIssue["seat"]; title: string }[] = [
  { seat: "student", title: "Students" },
  { seat: "leader", title: "Leaders" },
  { seat: "admin", title: "Admins" },
];

type IssueActions = {
  /** The season being started: where a leader is fixed (the issue carries no group id). */
  seasonCode: string;
  seasonTitle: string;
  busy: boolean;
  onRemove: (issue: StartIssue) => void;
  onOpenSeason: (code: string) => void;
  onOverride: (issue: StartIssue) => void;
};

type SeasonInTheWay = SeasonStartCheck["seasonsInTheWay"][number];

function SeasonInTheWayRow({ other, onOpen }: { other: SeasonInTheWay; onOpen: (code: string) => void }) {
  return (
    <View className="flex-col gap-2 px-4 py-3">
      <Text variant="subhead">{other.message}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          accessibilityLabel={`Open ${other.title}`}
          onPress={() => onOpen(other.code)}
        >
          {`Open ${other.title}`}
        </Button>
      </View>
    </View>
  );
}

function IssueRow({ issue, actions }: { issue: StartIssue; actions: IssueActions }) {
  const { seasonCode, seasonTitle, busy, onRemove, onOpenSeason, onOverride } = actions;
  return (
    <View className="flex-col gap-2 px-4 py-3">
      <Text variant="headline">{issue.name}</Text>
      <Text variant="subhead">{issue.message}</Text>
      <View className="flex-row flex-wrap gap-2">
        {issue.seat === "leader" ? (
          // A leader leaves through their group, and the issue has no group id:
          // the season screen lists every group with its leaders.
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            accessibilityLabel={`Open ${seasonTitle}`}
            onPress={() => onOpenSeason(seasonCode)}
          >
            {`Open ${seasonTitle}`}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            accessibilityLabel={`Remove ${issue.name}`}
            onPress={() => onRemove(issue)}
          >
            Remove
          </Button>
        )}
        {issue.otherSeasonCode ? (
          <Button
            size="sm"
            variant="secondary"
            accessibilityLabel={`Open ${issue.otherSeasonCode}`}
            onPress={() => onOpenSeason(issue.otherSeasonCode!)}
          >
            {`Open ${issue.otherSeasonCode}`}
          </Button>
        ) : null}
        {OVERRIDABLE.has(issue.reason) ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            accessibilityLabel={`Override ${issue.name}`}
            onPress={() => onOverride(issue)}
          >
            Override
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** What stops the season from starting: seasons to end first, then the people grouped by seat: Students, Leaders, Admins. */
export function IssueList({
  items,
  seasonsInTheWay,
  actions,
}: {
  items: StartIssue[];
  seasonsInTheWay: SeasonInTheWay[];
  actions: IssueActions;
}) {
  return (
    <View className="flex-col gap-5">
      <EmptyState
        tone="info"
        title="Sort these out first"
        description="Starting needs every seat clear. Fix each one below, then start the season."
      />
      {seasonsInTheWay.length > 0 ? (
        <GroupedList header={`Seasons to end first (${seasonsInTheWay.length})`}>
          {seasonsInTheWay.map((other) => (
            <SeasonInTheWayRow key={other.id} other={other} onOpen={actions.onOpenSeason} />
          ))}
        </GroupedList>
      ) : null}
      {SEATS.map(({ seat, title }) => {
        const rows = items.filter((i) => i.seat === seat);
        if (rows.length === 0) return null;
        return (
          <GroupedList key={seat} header={`${title} (${rows.length})`}>
            {rows.map((issue) => (
              <IssueRow key={`${issue.userId}-${issue.reason}`} issue={issue} actions={actions} />
            ))}
          </GroupedList>
        );
      })}
    </View>
  );
}
