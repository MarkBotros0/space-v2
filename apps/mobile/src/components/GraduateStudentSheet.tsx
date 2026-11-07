import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { graduateStudentRequestSchema } from "@space/shared";

import { useGraduateStudent } from "../hooks/use-students";
import { apiErrorCode, apiErrorMessage } from "../lib/api-error";
import { Button } from "../design/ui/button";
import { FormField } from "../design/ui/form-field";
import { Input } from "../design/ui/input";
import { Sheet, SheetSaveBar } from "../design/ui/sheet";
import { Switch } from "../design/ui/switch";
import { Text } from "../design/ui/text";
import { Textarea } from "../design/ui/textarea";

export interface GraduateStudentSheetProps {
  visible: boolean;
  studentId: number;
  studentName: string;
  onClose: () => void;
}

const REASON_MIN = 10;
const REASON_MAX = 1000;
const TICK_LABEL = "I understand this can't be undone";

/**
 * v1's graduate-student-button.tsx modal (a bottom sheet at phone width). The year
 * defaults to the current one (R59) and is checked with the SAME shared
 * schema the server runs — v1 hand-wrote a second copy of the bound.
 *
 * People graduate by passing a graduating season, so the server refuses anyone
 * else with `not_qualified`. The exception is this same sheet changing its words,
 * never a second modal: one presented as another dismisses can be dropped on iOS.
 * It lists what graduating them anyway does, and posts `override` only with a
 * written reason (at least 10 characters) and a tick; the server keeps both with
 * the super's name, and shows them to supers alone.
 */
export function GraduateStudentSheet({
  visible,
  studentId,
  studentName,
  onClose,
}: GraduateStudentSheetProps) {
  const graduate = useGraduateStudent();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Whether the server has said this person needs the exception. */
  const [exception, setException] = useState(false);
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  // On opening, not closing: the words shouldn't change while the sheet slides away.
  useEffect(() => {
    if (visible) {
      setException(false);
      setReason("");
      setUnderstood(false);
      setError(null);
      setFieldError(null);
    }
  }, [visible]);

  // Live, like the import sheet's year field: "12345678" is flagged as it is typed, not on Save.
  const trimmedYear = year.trim();
  const yearNum = Number(trimmedYear);
  const currentYear = new Date().getFullYear();
  const yearInvalid =
    trimmedYear !== "" && !(/^\d{4}$/.test(trimmedYear) && yearNum >= 1990 && yearNum <= currentYear);
  const yearError = yearInvalid ? `Enter a year between 1990 and ${currentYear}.` : null;

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= REASON_MIN;
  const reasonError =
    trimmedReason !== "" && !reasonValid ? `Write at least ${REASON_MIN} characters.` : undefined;
  const locked = exception && !(reasonValid && understood);
  const lockedReason = !reasonValid
    ? `Write a reason of at least ${REASON_MIN} characters, then tick the box.`
    : "Tick the box to confirm you understand.";

  const close = () => {
    setFieldError(null);
    setError(null);
    onClose();
  };

  const post = (graduationYear: number, overrideReason?: string) => {
    graduate.mutate(
      { id: studentId, graduationYear, ...(overrideReason ? { override: true, overrideReason } : {}) },
      {
        onSuccess: close,
        onError: (err) => {
          if (overrideReason === undefined && apiErrorCode(err) === "not_qualified") {
            setException(true);
            return;
          }
          setError(apiErrorMessage(err, "Couldn't graduate this student."));
        },
      },
    );
  };

  const submit = () => {
    setFieldError(null);
    setError(null);
    if (exception) {
      if (locked) return;
      post(yearNum, trimmedReason);
      return;
    }
    const trimmed = year.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setFieldError(`Enter a year between 1990 and ${currentYear}.`);
      return;
    }
    const parsed = graduateStudentRequestSchema.safeParse({ graduationYear: Number(trimmed) });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid year.");
      return;
    }
    post(parsed.data.graduationYear);
  };

  return (
    <Sheet
      open={visible}
      onClose={() => {
        if (!graduate.isPending) close();
      }}
      title={exception ? `Graduate ${studentName} anyway?` : `Graduate ${studentName}?`}
      footer={
        <SheetSaveBar
          label={exception ? "Graduate anyway" : "Graduate student"}
          variant={exception ? "destructive" : "primary"}
          loading={graduate.isPending}
          onPress={submit}
          disabled={locked}
          disabledReason={locked ? lockedReason : undefined}
          hint={error ?? (exception ? (locked ? lockedReason : undefined) : (yearError ?? fieldError ?? undefined))}
        />
      }
    >
      {exception ? (
        <View className="flex-col gap-4 pb-4">
          <View accessible accessibilityRole="alert" className="rounded-control bg-bad-soft px-3 py-2">
            <Text variant="subhead" className="font-semibold text-bad">
              {`${studentName} hasn't passed a graduating season. Students become alumni by passing one. Only use this in a very rare case.`}
            </Text>
          </View>
          <View className="flex-col gap-2">
            <Text variant="headline" accessibilityRole="header">
              What happens
            </Text>
            <Text variant="subhead">They become an alumnus permanently. This can&apos;t be undone in the app.</Text>
            <Text variant="subhead">{`They'll be listed as School of ${trimmedYear}.`}</Text>
            <Text variant="subhead">
              They can be appointed leader or admin, and can no longer join regular seasons as a student.
            </Text>
            <Text variant="subhead">Any season they&apos;re in now ends for them, with no result.</Text>
            <Text variant="subhead">Your name and your reason are recorded.</Text>
          </View>
          <FormField
            label="Reason"
            required
            description="Only super admins can read this."
            error={reasonError}
          >
            <Textarea
              accessibilityLabel="Reason"
              value={reason}
              maxLength={REASON_MAX}
              onChangeText={setReason}
            />
          </FormField>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={TICK_LABEL}
            accessibilityState={{ checked: understood }}
            onPress={() => setUnderstood((v) => !v)}
            className="min-h-11 flex-row items-center gap-3"
          >
            <View pointerEvents="none">
              <Switch checked={understood} />
            </View>
            <Text variant="body" className="min-w-0 flex-1">
              {TICK_LABEL}
            </Text>
          </Pressable>
          <Button variant="secondary" disabled={graduate.isPending} onPress={close}>
            Cancel
          </Button>
        </View>
      ) : (
        <View className="flex-col gap-4 pb-4">
          <Text variant="subhead" className="text-muted-foreground">
            {`Marks ${studentName} as a JPCS alumnus, completes every active season enrollment, and removes them from the active roster. They become eligible for leader, admin or mentor roles. This can't be undone.`}
          </Text>
          <FormField label="JPCS graduation year" required error={yearError ?? fieldError ?? undefined}>
            <Input
              accessibilityLabel="JPCS graduation year"
              value={year}
              onChangeText={(v) => {
                setYear(v);
                setFieldError(null);
              }}
              keyboardType="number-pad"
            />
          </FormField>
        </View>
      )}
    </Sheet>
  );
}
