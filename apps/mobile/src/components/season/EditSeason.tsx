import { useState } from "react";
import { View } from "react-native";
import type { SeasonDetail } from "@space/shared";

import { Card, CardContent, CardHeader, CardTitle } from "../../design/ui/card";
import { Button, FormField, Input, Text, Textarea } from "../../design/ui";
import { useUpdateSeason, type UpdateSeasonInput } from "../../hooks/use-season-writes";
import { apiErrorMessage } from "../../lib/api-error";

/**
 * An ADMIN's allowlisted season edit (description and absence budget) — shared
 * by /season and /seasons/[code]. V2-ONLY: v1's admin season page is read-only
 * (`canEdit={false}`), so this is a v1 Card with v1 form fields.
 */
export function EditSeason({ season }: { season: SeasonDetail }) {
  const update = useUpdateSeason(season.id);
  const [description, setDescription] = useState(season.description ?? "");
  // The detail contract does not carry the two budget fields, so blank means
  // "leave unchanged" and only typed values are sent.
  const [budget, setBudget] = useState("");
  const [weight, setWeight] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const save = () => {
    const body: UpdateSeasonInput = { description: description.trim() === "" ? null : description };
    if (budget.trim() !== "") body.absenceBudgetMinutes = Number(budget);
    if (weight.trim() !== "") body.absenceWeightMinutes = Number(weight);
    setMessage(null);
    update.mutate(body, {
      onSuccess: () => setMessage({ text: "Saved.", error: false }),
      onError: (err) =>
        setMessage({ text: apiErrorMessage(err, "Couldn't save the season."), error: true }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Season settings</CardTitle>
      </CardHeader>
      <CardContent className="flex-col gap-4">
        <FormField label="Description">
          <Textarea
            accessibilityLabel="Description"
            value={description}
            onChangeText={setDescription}
          />
        </FormField>
        <FormField label="Absence budget (minutes)">
          <Input
            accessibilityLabel="Absence budget (minutes)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="number-pad"
          />
        </FormField>
        <FormField label="Absence weight (minutes)">
          <Input
            accessibilityLabel="Absence weight (minutes)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="number-pad"
          />
        </FormField>
        {message ? (
          <View accessibilityRole={message.error ? "alert" : undefined}>
            <Text
              className={
                message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"
              }
            >
              {message.text}
            </Text>
          </View>
        ) : null}
        <Button className="self-start" disabled={update.isPending} onPress={save}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
