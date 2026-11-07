import { useState } from "react";
import { View } from "react-native";
import type { SeasonDetail } from "@space/shared";

import { Button, FormField, Input, Text, Textarea } from "../../design/ui";
import { useUpdateSeason, type UpdateSeasonInput } from "../../hooks/use-season-writes";
import { apiErrorMessage } from "../../lib/api-error";

/**
 * A whole number of minutes, at least 1 — the server's rule
 * (seasonAdminPatchSchema: int, min 1). `Number("")` is 0 and `Number("1.5")`
 * is not an integer, so a digits-only test comes first.
 */
export function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * An ADMIN's allowlisted season edit (description and absence budget) — shared
 * by /season and /seasons/[code]. V2-ONLY: v1's admin season page is read-only
 * (`canEdit={false}`), so this is a plain section of v1 form fields. The budget
 * fields start from the season's stored values, which the detail carries.
 */
export function EditSeason({ season }: { season: SeasonDetail }) {
  const update = useUpdateSeason(season.id);
  const [description, setDescription] = useState(season.description ?? "");
  const [budget, setBudget] = useState(String(season.absenceBudgetMinutes));
  const [weight, setWeight] = useState(String(season.absenceWeightMinutes));
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const dirty =
    description !== (season.description ?? "") ||
    budget !== String(season.absenceBudgetMinutes) ||
    weight !== String(season.absenceWeightMinutes);

  // An error belongs to the values that caused it: any edit clears it.
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setMessage((m) => (m?.error ? null : m));
  };

  const save = () => {
    const budgetMinutes = parseMinutes(budget);
    const weightMinutes = parseMinutes(weight);
    if (budgetMinutes === null || weightMinutes === null) {
      setMessage({
        text: "Absence budget and weight must be whole numbers of minutes, at least 1.",
        error: true,
      });
      return;
    }
    const body: UpdateSeasonInput = {
      description: description.trim() === "" ? null : description,
      absenceBudgetMinutes: budgetMinutes,
      absenceWeightMinutes: weightMinutes,
    };
    setMessage(null);
    update.mutate(body, {
      onSuccess: () => setMessage({ text: "Saved.", error: false }),
      onError: (err) =>
        setMessage({ text: apiErrorMessage(err, "Couldn't save the season."), error: true }),
    });
  };

  return (
    <View className="flex-col gap-4">
      <Text variant="headline" accessibilityRole="header">
        Season settings
      </Text>
      <FormField label="Description">
        <Textarea
          accessibilityLabel="Description"
          value={description}
          onChangeText={edit(setDescription)}
        />
      </FormField>
      <FormField label="Absence budget (minutes)">
        <Input
          accessibilityLabel="Absence budget (minutes)"
          value={budget}
          onChangeText={edit(setBudget)}
          keyboardType="number-pad"
        />
      </FormField>
      <FormField label="Absence weight (minutes)">
        <Input
          accessibilityLabel="Absence weight (minutes)"
          value={weight}
          onChangeText={edit(setWeight)}
          keyboardType="number-pad"
        />
      </FormField>
      {message ? (
        <View accessibilityRole={message.error ? "alert" : undefined}>
          <Text variant="subhead" className={message.error ? "text-bad" : "text-muted-foreground"}>
            {message.text}
          </Text>
        </View>
      ) : null}
      <Button className="self-start" disabled={update.isPending || !dirty} onPress={save}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </View>
  );
}
