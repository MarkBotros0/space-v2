import { useState } from "react";
import { View } from "react-native";
import { classLabel, SEASON_RESULT_REASON_MAX } from "@space/shared";

import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { SegmentedControl } from "../../design/ui/segmented-control";
import { Text } from "../../design/ui/text";
import { Textarea } from "../../design/ui/textarea";
import { rowLabel } from "./end-review-model";

type ResultValue = "PASSED" | "NOT_PASSED";
type ResultDraft = { result: ResultValue; reason: string };

const OPTIONS = [
  { value: "PASSED", label: "Passed" },
  { value: "NOT_PASSED", label: "Did not pass" },
];

/** What the correction screen knows about a graduating season's student. */
type ResultGraduation = { isAlumnus: boolean; stored: ResultValue | null; year: number | null };

/** What saving this draft does to alumni status, on a graduating season; null when it does nothing to say. */
function graduationNote(graduation: ResultGraduation, result: ResultValue): string | null {
  if (result === "PASSED")
    return graduation.isAlumnus
      ? null
      : `${graduation.year === null ? "Passing graduates them" : `Passing makes them ${classLabel(graduation.year)}`}. Any regular season they're in now ends for them. A community-wide season carries on.`;
  return graduation.isAlumnus && graduation.stored !== "NOT_PASSED" ? "This doesn't remove their alumni status." : null;
}

type Props = {
  student: { userId: number; name: string } | null;
  initial: ResultDraft;
  /** Set when correcting a result on a graduating season. Ending one warns on its review instead. */
  graduation?: ResultGraduation;
  /**
   * Set when ending a season: whether the student's score reaches the pass mark (null: no score).
   * Passing a student below the mark then takes an optional note, and the sheet says when the
   * result goes against the score.
   */
  onTrack?: boolean | null;
  saveLabel: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (draft: ResultDraft) => void;
};

/** The text field the result takes: a reason for Did not pass, a note for passing below the mark. */
function textField(result: ResultValue, onTrack: boolean | null | undefined) {
  if (result === "NOT_PASSED") return { label: "Reason", placeholder: "Reason (optional)" };
  if (onTrack === false) return { label: "Note", placeholder: "Why they pass below the mark (optional)" };
  return null;
}

function ResultSheetBody({ student, initial, graduation, onTrack, saveLabel, saving, error, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(initial);
  const note = graduation ? graduationNote(graduation, draft.result) : null;
  const field = textField(draft.result, onTrack);
  const against = onTrack === undefined ? null : rowLabel(draft.result, onTrack);
  return (
    <Sheet
      open={student !== null}
      onClose={onClose}
      title={student ? `Result for ${student.name}` : undefined}
      footer={
        <SheetSaveBar
          label={saveLabel}
          onPress={() => onSave(field ? draft : { ...draft, reason: "" })}
          loading={saving}
          error={error}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <SegmentedControl
          options={OPTIONS}
          value={draft.result}
          onChange={(result) => setDraft((d) => ({ ...d, result: result as ResultValue }))}
        />
        {against ? (
          <Text variant="subhead" className="font-semibold text-foreground">
            {against}
          </Text>
        ) : null}
        {note ? (
          <Text variant="subhead" className="text-foreground">
            {note}
          </Text>
        ) : null}
        {field ? (
          <View className="flex-col gap-1.5">
            <Textarea
              accessibilityLabel={field.label}
              placeholder={field.placeholder}
              value={draft.reason}
              maxLength={SEASON_RESULT_REASON_MAX}
              onChangeText={(reason) => setDraft((d) => ({ ...d, reason }))}
            />
            <Text variant="caption" className="text-muted-foreground">
              Staff only. The student won&apos;t see this.
            </Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * One student's result as a bottom sheet: Passed / Did not pass and an optional
 * staff-only reason (or, passing below the mark at End, a note). Used to stage a verdict before the season ends ("Done") and
 * to correct one after ("Save result"). Keyed by student, so each opening starts
 * from that student's own values.
 */
export function ResultSheet(props: Props) {
  return <ResultSheetBody key={props.student?.userId ?? "none"} {...props} />;
}
