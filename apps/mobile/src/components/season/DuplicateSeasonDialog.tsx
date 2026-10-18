import { format } from "date-fns";
import { Copy } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { duplicateSeasonRequestSchema, type SeasonDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { FormErrorBox } from "../../design/forms/form-parts";
import { Button, DatePicker, Input } from "../../design/ui";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../design/ui/modal";
import { FormField } from "../../design/ui/form-field";
import { useDuplicateSeason } from "../../hooks/use-season-writes";
import { apiErrorMessage } from "../../lib/api-error";
import { firstErrorByField } from "../../lib/form-errors";
import { addYearsIso, autoSeasonCode } from "../../lib/season-defaults";
import { dayToDate } from "./SeasonForm";

iconWithClassName(Copy);

/**
 * v1 duplicate-season-dialog.tsx: a button that opens a sheet with Year, Code
 * and the two dates, defaulting to next year with the dates one year on and
 * the code following the year until typed over. Success hands the new code to
 * the caller, which opens the copy.
 */
export function DuplicateSeasonDialog({
  season,
  onDuplicated,
}: {
  season: Pick<SeasonDetail, "id" | "program" | "year" | "startDate" | "endDate">;
  onDuplicated: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const duplicate = useDuplicateSeason(season.id);
  const nextYear = season.year + 1;
  const [year, setYear] = useState(String(nextYear));
  const [code, setCode] = useState(autoSeasonCode(season.program, nextYear));
  const [codeTouched, setCodeTouched] = useState(false);
  const [startDay, setStartDay] = useState(addYearsIso(season.startDate, 1).slice(0, 10));
  const [endDay, setEndDay] = useState(addYearsIso(season.endDate, 1).slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    const body = {
      year: Number(year),
      code: code.trim() === "" ? undefined : code,
      startDate: `${startDay}T00:00:00.000Z`,
      endDate: `${endDay}T00:00:00.000Z`,
    };
    const parsed = duplicateSeasonRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    duplicate.mutate(body, {
      onSuccess: (created) => {
        setOpen(false);
        onDuplicated(created.code);
      },
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't duplicate the season.")),
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onPress={() => setOpen(true)}>
        <Copy size={14} className="text-foreground" />
        Duplicate
      </Button>
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{`Duplicate ${season.program} ${season.year}`}</ModalTitle>
            <ModalDescription>
              Copies groups, sessions, and assignments with dates shifted to match. Students are not
              copied — the new season starts as an empty batch.
            </ModalDescription>
          </ModalHeader>
          <View className="flex-col gap-4">
            <FormField label="Year" required error={errors.year}>
              <Input
                accessibilityLabel="Year"
                value={year}
                onChangeText={(value) => {
                  setYear(value);
                  if (!codeTouched) setCode(autoSeasonCode(season.program, value));
                }}
                keyboardType="number-pad"
              />
            </FormField>
            <FormField
              label="Code"
              required
              description="URL slug — auto-filled from year."
              error={errors.code}
            >
              <Input
                accessibilityLabel="Code"
                value={code}
                onChangeText={(value) => {
                  setCodeTouched(true);
                  setCode(value);
                }}
                autoCapitalize="none"
              />
            </FormField>
            <FormField label="Start date" required error={errors.startDate}>
              <DatePicker
                accessibilityLabel="Start date"
                value={dayToDate(startDay)}
                onChange={(d) => setStartDay(format(d, "yyyy-MM-dd"))}
              />
            </FormField>
            <FormField label="End date" required error={errors.endDate}>
              <DatePicker
                accessibilityLabel="End date"
                value={dayToDate(endDay)}
                onChange={(d) => setEndDay(format(d, "yyyy-MM-dd"))}
              />
            </FormField>
            <FormErrorBox message={message} />
          </View>
          <ModalFooter>
            <Button variant="outline" disabled={duplicate.isPending} onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={duplicate.isPending} onPress={submit}>
              {duplicate.isPending ? "Duplicating…" : "Duplicate season"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
