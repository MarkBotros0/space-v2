/**
 * The season admin's score for one student on an ONLINE quiz (plan 4, docs/rules/quiz-results.md
 * "Manual score"). It always counts, even below an app attempt, so the sheet shows where the
 * student stands in the app first. Only the season's admin or a super gets here (the caller gates
 * on `canReleaseResults`, the same gate as releasing answers). An open attempt must be ended
 * first (409 `attempt_open`), which the sheet links to on the live screen. Clearing asks first;
 * the confirm sits inside the sheet, since closing one modal while opening another drops the
 * second on iOS.
 */
import { useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Button, ConfirmDialog, FormField, Input, Sheet, SheetSaveBar, Text, Textarea } from "../../design/ui";
import { useClearManualScore, useSaveManualScore } from "../../hooks/use-quizzes";
import { apiErrorCode, apiErrorMessage } from "../../lib/api-error";
import { formatDate, formatScore, unbreakable } from "../../lib/format";
import { parseManualScore, type ManualScoreTarget } from "./manual-score-model";

type Args = {
  quizId: number;
  target: ManualScoreTarget;
  maxScore: number;
  open: boolean;
  /** After a save, a clear, or the live link: the sheet is done. */
  onDone: () => void;
};

/** What the sheet draws, apart from its frame: the attempt sheet shows the same in place. */
type ManualScoreParts = { title: string; footer: ReactNode; body: ReactNode };

const seedScore = (target: ManualScoreTarget) =>
  target.adminScore === null ? "" : formatScore(target.adminScore.score);

function enteredLine(adminScore: NonNullable<ManualScoreTarget["adminScore"]>): string {
  const when = unbreakable(formatDate(adminScore.gradedAt));
  return adminScore.gradedByName ? `Entered by ${adminScore.gradedByName} on ${when}.` : `Entered on ${when}.`;
}

export function useManualScoreSheet({ quizId, target, maxScore, open, onDone }: Args): ManualScoreParts {
  const router = useRouter();
  const save = useSaveManualScore(quizId);
  const clear = useClearManualScore(quizId);
  const [score, setScore] = useState(() => seedScore(target));
  const [notes, setNotes] = useState(() => target.adminScore?.notes ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [attemptOpen, setAttemptOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The server's score, as a value: once a save or a clear lands, the fields show what is stored.
  const seed = JSON.stringify(target.adminScore);
  const [seeded, setSeeded] = useState(seed);
  if (seed !== seeded) {
    setSeeded(seed);
    setScore(seedScore(target));
    setNotes(target.adminScore?.notes ?? "");
  }
  // A failure belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldError(undefined);
    setAttemptOpen(false);
  }, [open]);
  const name = target.name;

  const onSave = () => {
    const parsed = parseManualScore(score, maxScore);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(undefined);
    setError(null);
    setAttemptOpen(false);
    const note = notes.trim();
    save.mutate(
      { studentUserId: target.studentUserId, score: parsed.score, notes: note === "" ? null : note },
      {
        onSuccess: () => {
          haptic("success");
          onDone();
        },
        onError: (err) => {
          if (apiErrorCode(err) === "attempt_open") setAttemptOpen(true);
          else setError(apiErrorMessage(err, "Couldn't save the score."));
        },
      },
    );
  };

  const onClear = () => {
    clear.mutate(target.studentUserId, {
      onSuccess: () => {
        haptic("success");
        setConfirming(false);
        onDone();
      },
      onError: (err) => {
        setConfirming(false);
        setError(apiErrorMessage(err, "Couldn't clear the score."));
      },
    });
  };

  const openLive = () => {
    onDone();
    router.push({ pathname: "/quiz/[id]/live", params: { id: String(quizId) } });
  };

  const body = (
    <View className="flex-col gap-4 pb-4">
      <View className="flex-col gap-1">
        <Text variant="headline">{target.appStatus}</Text>
        <Text variant="subhead" className="text-muted-foreground">
          This score replaces the app's score for this student.
        </Text>
        {target.adminScore ? (
          <Text variant="caption" className="text-muted-foreground">
            {enteredLine(target.adminScore)}
          </Text>
        ) : null}
      </View>
      <FormField label={`Score out of ${formatScore(maxScore)}`} error={fieldError}>
        <Input
          accessibilityLabel={`Score for ${name}`}
          keyboardType="decimal-pad"
          placeholder="For example 7.5"
          value={score}
          onChangeText={(text) => {
            setScore(text);
            setFieldError(undefined);
          }}
        />
      </FormField>
      <FormField label="Note" description="The student sees this note with their score.">
        <Textarea
          accessibilityLabel={`Note for ${name}`}
          placeholder="Optional note"
          value={notes}
          onChangeText={setNotes}
        />
      </FormField>
      {attemptOpen ? (
        <View className="flex-col items-start gap-1" accessibilityRole="alert">
          <Text variant="subhead" className="text-bad">
            End their attempt first.
          </Text>
          <Button variant="plain" size="sm" accessibilityRole="link" onPress={openLive}>
            Open the live screen
          </Button>
        </View>
      ) : null}
      {target.adminScore ? (
        <Button
          variant="destructive"
          size="sm"
          className="self-start"
          disabled={clear.isPending || save.isPending}
          onPress={() => setConfirming(true)}
        >
          Clear score
        </Button>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next && !clear.isPending) setConfirming(false);
          }}
          title={`Clear ${name}'s score?`}
          description="Their app score counts again, if they have one. Nothing is reopened."
          confirmLabel="Clear score"
          destructive
          pending={clear.isPending}
          onConfirm={onClear}
        />
      ) : null}
    </View>
  );

  return {
    title: target.adminScore ? `Edit ${name}'s manual score` : `Enter ${name}'s score manually`,
    footer: (
      <SheetSaveBar
        label="Save score"
        onPress={onSave}
        loading={save.isPending}
        disabled={clear.isPending}
        error={error}
      />
    ),
    body,
  };
}

/** The sheet on its own, for a student with no attempt to open (the waiting list). */
export function ManualScoreSheet({ onClose, ...args }: Omit<Args, "onDone"> & { onClose: () => void }) {
  const parts = useManualScoreSheet({ ...args, onDone: onClose });
  return (
    <Sheet open={args.open} onClose={onClose} title={parts.title} footer={parts.footer}>
      {parts.body}
    </Sheet>
  );
}
