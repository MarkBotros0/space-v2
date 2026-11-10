import { useState } from "react";
import { View } from "react-native";
import { duplicateSeasonRequestSchema, type SeasonDetail } from "@space/shared";

import { FormErrorBox } from "../../design/forms/form-parts";
import { DatePicker, Input, Sheet, SheetSaveBar, Text } from "../../design/ui";
import { FormField } from "../../design/ui/form-field";
import { useDuplicateSeason } from "../../hooks/use-season-writes";
import { apiErrorMessage } from "../../lib/api-error";
import { useSchemaErrors } from "../../lib/form-errors";
import { addYearsIso, autoSeasonCode } from "../../lib/season-defaults";
import { dayToDate } from "./season-form";
import { dateToDay } from "../../lib/day-key";

/**
 * v1 duplicate-season-dialog.tsx as a bottom sheet the caller opens (the
 * "Duplicate season" row): Year, Code and the two dates, defaulting to next
 * year with the dates one year on and the code following the year until typed
 * over. Success hands the new code to the caller, which opens the copy.
 */
export function DuplicateSeasonDialog({
  season,
  open,
  onClose,
  onDuplicated,
}: {
  season: Pick<SeasonDetail, "id" | "program" | "year" | "startDate" | "endDate">;
  open: boolean;
  onClose: () => void;
  onDuplicated: (code: string) => void;
}) {
  const duplicate = useDuplicateSeason(season.id);
  const nextYear = season.year + 1;
  const [year, setYear] = useState(String(nextYear));
  const [code, setCode] = useState(autoSeasonCode(season.program, nextYear));
  const [codeTouched, setCodeTouched] = useState(false);
  const [startDay, setStartDay] = useState(addYearsIso(season.startDate, 1).slice(0, 10));
  const [endDay, setEndDay] = useState(addYearsIso(season.endDate, 1).slice(0, 10));
  const { errors, setErrors, validate } = useSchemaErrors(duplicateSeasonRequestSchema);
  const [message, setMessage] = useState<string | null>(null);

  // Sheet unmounts its children when closed, but this state lives above it:
  // a reopen must start from the defaults, not from what was typed before.
  const close = () => {
    setYear(String(nextYear));
    setCode(autoSeasonCode(season.program, nextYear));
    setCodeTouched(false);
    setStartDay(addYearsIso(season.startDate, 1).slice(0, 10));
    setEndDay(addYearsIso(season.endDate, 1).slice(0, 10));
    setErrors({});
    setMessage(null);
    onClose();
  };

  const submit = () => {
    setMessage(null);
    const body = {
      year: Number(year),
      code: code.trim() === "" ? undefined : code,
      startDate: `${startDay}T00:00:00.000Z`,
      endDate: `${endDay}T00:00:00.000Z`,
    };
    if (!validate(body)) return;
    duplicate.mutate(body, {
      onSuccess: (created) => {
        close();
        onDuplicated(created.code);
      },
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't duplicate the season.")),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!duplicate.isPending) close();
      }}
      title={`Duplicate ${season.program} ${season.year}`}
      footer={<SheetSaveBar label="Duplicate" loading={duplicate.isPending} onPress={submit} />}
    >
      <View className="flex-col gap-4">
        <Text variant="subhead" className="text-muted-foreground">
          Copies groups, sessions, and assignments with dates shifted to match. Students are not copied — the new season
          starts as an empty batch.
        </Text>
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
        <FormField label="Code" required description="URL slug — auto-filled from year." error={errors.code}>
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
            onChange={(d) => setStartDay(dateToDay(d))}
          />
        </FormField>
        <FormField label="End date" required error={errors.endDate}>
          <DatePicker
            accessibilityLabel="End date"
            value={dayToDate(endDay)}
            onChange={(d) => setEndDay(dateToDay(d))}
          />
        </FormField>
        <FormErrorBox message={message} />
      </View>
    </Sheet>
  );
}
