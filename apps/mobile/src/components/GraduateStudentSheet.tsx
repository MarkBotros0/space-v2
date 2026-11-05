import { useState } from "react";
import { View } from "react-native";
import { graduateStudentRequestSchema } from "@space/shared";

import { useGraduateStudent } from "../hooks/use-students";
import { apiErrorMessage } from "../lib/api-error";
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

  const close = () => {
    setFieldError(null);
    setError(null);
    onClose();
  };

  const submit = () => {
    setFieldError(null);
    setError(null);
    const trimmed = year.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setFieldError("Enter a four-digit year.");
      return;
    }
    const parsed = graduateStudentRequestSchema.safeParse({ graduationYear: Number(trimmed) });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid year.");
      return;
    }
    graduate.mutate(
      { id: studentId, graduationYear: parsed.data.graduationYear },
      {
        onSuccess: close,
        onError: (err) => setError(apiErrorMessage(err, "Couldn't graduate this student.")),
      },
    );
  };

  return (
    <Sheet
      open={visible}
      onClose={() => {
        if (!graduate.isPending) close();
      }}
      title={`Graduate ${studentName}?`}
      footer={
        <SheetSaveBar
          label="Graduate student"
          loading={graduate.isPending}
          onPress={submit}
          hint={error ?? fieldError ?? undefined}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <Text variant="subhead" className="text-muted-foreground">
          {`Marks ${studentName} as a JPCS alumnus, completes every active season enrollment, and removes them from the active roster. They become eligible for leader, admin or mentor roles. This can't be undone.`}
        </Text>
        <FormField label="JPCS graduation year" required error={fieldError ?? undefined}>
          <Input
            accessibilityLabel="JPCS graduation year"
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
          />
        </FormField>
      </View>
    </Sheet>
  );
}
