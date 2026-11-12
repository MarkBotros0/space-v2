/**
 * The body of /seasons/[code]/passing (season passing, spec 2026-11-12 "Passing outlook"): how many
 * are on track and below the mark, the season's pass criteria (the season's admin or a super edits
 * them in `CriteriaSheet`; a leader reads them), and every student the caller sees with their score,
 * below the mark first as the server orders them. A row opens the student's page, where their
 * missing work and lowest quizzes are. "Send a reminder" opens a new announcement; only someone
 * who may post one (the season's admin or a super) sees it.
 */
import type { PassingOutlook } from "@space/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Button, EmptyState, GroupedList, ListRow, StatusChip, Text, toast } from "../../design/ui";
import { useSavePassCriteria } from "../../hooks/use-season-passing";
import { apiErrorMessage } from "../../lib/api-error";
import { CriteriaSheet } from "./criteria-sheet";
import { criteriaLines, criteriaNotes, outlookHeader, outlookRowView } from "./outlook-model";

function Counts({ outlook, onRemind }: { outlook: PassingOutlook; onRemind?: () => void }) {
  const header = outlookHeader(outlook);
  return (
    <View className="flex-col gap-1 rounded-group bg-surface p-4">
      <Text variant="title">{header.onTrack}</Text>
      <Text variant="title">{header.below}</Text>
      {header.noScore ? (
        <Text variant="subhead" className="text-muted-foreground">
          {header.noScore}
        </Text>
      ) : null}
      {onRemind && outlook.below > 0 ? (
        <Button variant="secondary" size="sm" className="mt-2 self-start" onPress={onRemind}>
          Send a reminder
        </Button>
      ) : null}
    </View>
  );
}

const NOTHING_YET = "Nothing to count yet. Criteria can be set once the season has a session, an assignment or a quiz.";

function Criteria({ outlook, onEdit }: { outlook: PassingOutlook; onEdit?: () => void }) {
  const anything = outlook.available.attendance || outlook.available.assignments || outlook.available.quizzes;
  return (
    <View className="flex-col gap-2 rounded-group bg-surface p-4">
      <Text variant="headline" accessibilityRole="header">
        Pass criteria
      </Text>
      {criteriaLines(outlook).map((line) => (
        <Text key={line} variant="body">
          {line}
        </Text>
      ))}
      {criteriaNotes(outlook).map((note) => (
        <Text key={note} variant="caption" className="text-muted-foreground">
          {note}
        </Text>
      ))}
      {anything ? null : (
        <Text variant="caption" className="text-muted-foreground">
          {NOTHING_YET}
        </Text>
      )}
      {onEdit && anything ? (
        <Button variant="secondary" size="sm" className="mt-1 self-start" onPress={onEdit}>
          Edit criteria
        </Button>
      ) : null}
    </View>
  );
}

function Students({ outlook }: { outlook: PassingOutlook }) {
  const router = useRouter();
  if (outlook.rows.length === 0) {
    return <EmptyState title="No students yet" description="Students show here with their score once they join." />;
  }
  return (
    <GroupedList header="Students">
      {outlook.rows.map((row) => {
        const view = outlookRowView(row, outlook);
        return (
          <ListRow
            key={view.userId}
            title={view.name}
            subtitle={view.lines.join("\n")}
            subtitleLines={null}
            trailing={<StatusChip tone={view.chip.tone} label={view.chip.label} />}
            trailingPlacement="below"
            chevron
            onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(view.userId) } })}
          />
        );
      })}
    </GroupedList>
  );
}

export function OutlookScreen({
  seasonId,
  outlook,
  canRemind,
}: {
  seasonId: number;
  outlook: PassingOutlook;
  /** May post an announcement to this season: the season's admin or a super, while it runs. */
  canRemind: boolean;
}) {
  const router = useRouter();
  const save = useSavePassCriteria(seasonId);
  const [editing, setEditing] = useState(false);

  const open = () => {
    save.reset();
    setEditing(true);
  };

  return (
    <View className="flex-col gap-4">
      <Counts outlook={outlook} onRemind={canRemind ? () => router.push("/announcements/new") : undefined} />
      <Criteria outlook={outlook} onEdit={outlook.canEditCriteria ? open : undefined} />
      <Students outlook={outlook} />
      {outlook.canEditCriteria ? (
        <CriteriaSheet
          open={editing}
          initial={outlook.criteria}
          available={outlook.available}
          readOnly={false}
          saveLabel="Save criteria"
          saving={save.isPending}
          error={save.isError ? apiErrorMessage(save.error, "Couldn't save the criteria. Try again.") : null}
          onSave={(criteria) =>
            save.mutate(criteria, {
              onSuccess: () => {
                haptic("light");
                toast.success("Pass criteria saved.");
                setEditing(false);
              },
            })
          }
          onClose={() => {
            if (!save.isPending) setEditing(false);
          }}
        />
      ) : null}
    </View>
  );
}
