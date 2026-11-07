import { useEffect, useState } from "react";
import { View } from "react-native";
import { graduateStudentRequestSchema } from "@space/shared";

import { useGraduateStudent } from "../hooks/use-students";
import { apiErrorCode, apiErrorMessage } from "../lib/api-error";
import { Button } from "../design/ui/button";
import { FormField } from "../design/ui/form-field";
import { Input } from "../design/ui/input";
import { Sheet, SheetSaveBar } from "../design/ui/sheet";
import { Text } from "../design/ui/text";

export interface GraduateStudentSheetProps {
  visible: boolean;
  studentId: number;
  studentName: string;
  onClose: () => void;
}

/**
 * v1's graduate-student-button.tsx modal (a bottom sheet at phone width). The year
 * defaults to the current one (R59) and is checked with the SAME shared
 * schema the server runs — v1 hand-wrote a second copy of the bound.
 *
 * People graduate by passing a graduating season, so the server refuses anyone
 * else with `not_qualified`. The extra confirmation is this same sheet changing
 * its words, never a second modal: one presented as another dismisses can be
 * dropped on iOS. Confirming re-posts with `override`, which the server audits.
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
  /** The server's reason this person needs an exception, once it has said so. */
  const [refusal, setRefusal] = useState<string | null>(null);
  // On opening, not closing: the words shouldn't change while the sheet slides away.
  useEffect(() => {
    if (visible) setRefusal(null);
  }, [visible]);

  // Live, like the import sheet's year field: "12345678" is flagged as it is typed, not on Save.
  const trimmedYear = year.trim();
  const yearNum = Number(trimmedYear);
  const currentYear = new Date().getFullYear();
  const yearInvalid =
    trimmedYear !== "" && !(/^\d{4}$/.test(trimmedYear) && yearNum >= 1990 && yearNum <= currentYear);
  const yearError = yearInvalid ? `Enter a year between 1990 and ${currentYear}.` : null;

  const close = () => {
    setFieldError(null);
    setError(null);
    onClose();
  };

  const post = (graduationYear: number, override: boolean) => {
    graduate.mutate(
      { id: studentId, graduationYear, override },
      {
        onSuccess: close,
        onError: (err) => {
          if (!override && apiErrorCode(err) === "not_qualified") {
            setRefusal(apiErrorMessage(err, `${studentName} hasn't passed a graduating season.`));
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
    if (refusal !== null) {
      post(yearNum, true);
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
    post(parsed.data.graduationYear, false);
  };

  return (
    <Sheet
      open={visible}
      onClose={() => {
        if (!graduate.isPending) close();
      }}
      title={refusal !== null ? `Graduate ${studentName} anyway?` : `Graduate ${studentName}?`}
      footer={
        <SheetSaveBar
          label={refusal !== null ? "Graduate anyway" : "Graduate student"}
          loading={graduate.isPending}
          onPress={submit}
          hint={error ?? yearError ?? fieldError ?? undefined}
        />
      }
    >
      {refusal !== null ? (
        <View className="flex-col gap-4 pb-4">
          <Text variant="subhead" className="text-muted-foreground">
            {`${refusal} Graduating them in ${trimmedYear} is an exception, and it's recorded. This can't be undone.`}
          </Text>
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
