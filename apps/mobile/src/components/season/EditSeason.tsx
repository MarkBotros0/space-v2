import { useState } from "react";
import type { SeasonDetail } from "@space/shared";

import { useUpdateSeason, type UpdateSeasonInput } from "../../hooks/use-season-writes";
import { apiErrorMessage } from "../../lib/api-error";
import { useTheme } from "../../theme";
import { Button, Card, Input, Text } from "../../ui";

/** An ADMIN's allowlisted season edit (description and absence budget) — shared by /season and /seasons/[code]. */
export function EditSeason({ season }: { season: SeasonDetail }) {
  const theme = useTheme();
  const update = useUpdateSeason(season.id);
  const [description, setDescription] = useState(season.description ?? "");
  // The detail contract does not carry the two budget fields, so blank means
  // "leave unchanged" and only typed values are sent.
  const [budget, setBudget] = useState("");
  const [weight, setWeight] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const body: UpdateSeasonInput = { description: description.trim() === "" ? null : description };
    if (budget.trim() !== "") body.absenceBudgetMinutes = Number(budget);
    if (weight.trim() !== "") body.absenceWeightMinutes = Number(weight);
    setMessage(null);
    update.mutate(body, {
      onSuccess: () => setMessage("Saved."),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the season.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Season settings</Text>
      <Input label="Description" value={description} onChangeText={setDescription} multiline />
      <Input label="Absence budget (minutes)" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
      <Input label="Absence weight (minutes)" value={weight} onChangeText={setWeight} keyboardType="number-pad" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Save changes" onPress={save} loading={update.isPending} />
    </Card>
  );
}
