import { useState } from "react";
import { graduateStudentRequestSchema } from "@space/shared";

import { useGraduateStudent } from "../hooks/use-students";
import { apiErrorMessage } from "../lib/api-error";
import { Button, Input, Sheet, Text } from "../ui";

export interface GraduateStudentSheetProps {
  visible: boolean;
  studentId: number;
  studentName: string;
  onClose: () => void;
}

/**
 * v1's graduate-student-button.tsx modal as a sheet (spec 06 §9). The year
 * defaults to the current one (R59) and is checked with the SAME shared
 * schema the server runs — v1 hand-wrote a second copy of the bound.
 */
export function GraduateStudentSheet({ visible, studentId, studentName, onClose }: GraduateStudentSheetProps) {
  const graduate = useGraduateStudent();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const trimmed = year.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setError("Enter a four-digit year.");
      return;
    }
    const parsed = graduateStudentRequestSchema.safeParse({ graduationYear: Number(trimmed) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid year.");
      return;
    }
    graduate.mutate(
      { id: studentId, graduationYear: parsed.data.graduationYear },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(apiErrorMessage(err, "Couldn't graduate this student.")),
      },
    );
  };

  return (
    <Sheet visible={visible} title={`Graduate ${studentName}?`} onClose={onClose}>
      <Text variant="body">
        {`Marks ${studentName} as a JPCS alumnus, completes every active season enrollment, and removes them from the active roster. They become eligible for leader, admin or mentor roles. This can't be undone.`}
      </Text>
      <Input
        label="JPCS graduation year"
        value={year}
        onChangeText={setYear}
        keyboardType="number-pad"
        error={error ?? undefined}
      />
      <Button title="Graduate student" onPress={submit} loading={graduate.isPending} />
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
