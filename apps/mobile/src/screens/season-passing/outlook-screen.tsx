/**
 * The body of /seasons/[code]/passing (season passing, spec 2026-11-12 "Passing outlook"; redesigned
 * by the owner's ask, 2026-11-13): how many are on track and below the mark, the season's pass
 * criteria (the season's admin or a super edits them in `CriteriaSheet`; a leader reads them), and
 * every student the caller sees in three sections (below the mark, on track, no score yet), each row
 * led by the student's score. A row opens the student's page, where their
 * missing work and lowest quizzes are. No "Send a reminder" (owner, 2026-11-13: it opened a blank
 * announcement, which confused more than it helped).
 */
import type { PassingOutlook } from "@space/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { EmptyState, GroupedList, ListRow, Text } from "../../design/ui";
import { useSavePassCriteria } from "../../hooks/use-season-passing";
import { apiErrorMessage } from "../../lib/api-error";
import { joinMeta } from "../../lib/join-meta";
import { CriteriaSheet } from "./criteria-sheet";
import { outlookSections, type OutlookStanding } from "./outlook-model";
import { CriteriaCard, OutlookCounts } from "./outlook-summary";

const BADGE_TONES: Record<OutlookStanding, string> = {
  below: "bg-bad-soft text-bad",
  onTrack: "bg-ok-soft text-ok",
  none: "bg-surface-raised text-muted-foreground",
};

/** The score, big enough to scan down the list; its tone repeats the section's words. */
function ScoreBadge({ text, standing }: { text: string; standing: OutlookStanding }) {
  const [bg, fg] = BADGE_TONES[standing].split(" ");
  return (
    <View className={`h-12 w-14 items-center justify-center rounded-control ${bg}`}>
      <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit className={fg}>
        {text}
      </Text>
    </View>
  );
}

function Students({ outlook }: { outlook: PassingOutlook }) {
  const router = useRouter();
  if (outlook.rows.length === 0) {
    return <EmptyState title="No students yet" description="Students show here with their score once they join." />;
  }
  return (
    <>
      {outlookSections(outlook).map((section) => (
        <GroupedList key={section.standing} header={section.header}>
          {section.rows.map((view) => (
            <ListRow
              key={view.userId}
              leading={<ScoreBadge text={view.badge} standing={view.standing} />}
              title={view.name}
              subtitle={view.lines.join("\n")}
              subtitleLines={null}
              spokenDetail={joinMeta([view.badge === "–" ? null : `Score ${view.badge}`, ...view.lines])}
              trailingLabel={view.chip.label}
              chevron
              onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(view.userId) } })}
            />
          ))}
        </GroupedList>
      ))}
    </>
  );
}

export function OutlookScreen({ seasonId, outlook }: { seasonId: number; outlook: PassingOutlook }) {
  const save = useSavePassCriteria(seasonId);
  const [editing, setEditing] = useState(false);

  const open = () => {
    save.reset();
    setEditing(true);
  };

  return (
    <View className="flex-col gap-4">
      <OutlookCounts outlook={outlook} />
      <CriteriaCard outlook={outlook} onEdit={outlook.canEditCriteria ? open : undefined} />
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
                haptic("success");
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
