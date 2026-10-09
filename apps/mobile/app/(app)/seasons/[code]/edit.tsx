import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  seasonStatusSchema,
  seasonWriteRequestSchema,
  slugifySeasonCode,
  type SeasonDetail,
  type SeasonStatus,
} from "@space/shared";

import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useDeleteSeason, useUpdateSeasonAsSuper } from "../../../../src/hooks/use-season-writes";
import { DeleteSeasonConfirm } from "../../../../src/components/season/SeasonList";
import { apiErrorMessage, apiFieldErrors } from "../../../../src/lib/api-error";
import { firstErrorByField } from "../../../../src/lib/form-errors";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../src/ui";

/**
 * SUPER's season edit (v1 /super/seasons/[code]/edit; spec 02 §9; G4). Every
 * identity field AND the status — v1's free four-way select (R17, Plan 6
 * D-16.4): DRAFT → ACTIVE → ARCHIVED is one tap each. Also hosts delete
 * (spec 02 §9). The PATCH is Plan 3's SUPER full body, so the stored budget
 * values are pre-filled and always sent (D-16.3).
 */
function SeasonEditForm({ season }: { season: SeasonDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const update = useUpdateSeasonAsSuper(season.id);
  const remove = useDeleteSeason();

  const [code, setCode] = useState(season.code);
  const [program, setProgram] = useState(season.program);
  const [year, setYear] = useState(String(season.year));
  const [description, setDescription] = useState(season.description ?? "");
  // Season dates are calendar days stored as UTC midnight (spec 02 D12).
  const [startDay, setStartDay] = useState(season.startDate.slice(0, 10));
  const [endDay, setEndDay] = useState(season.endDate.slice(0, 10));
  const [status, setStatus] = useState<SeasonStatus>(season.status);
  const [budget, setBudget] = useState(String(season.absenceBudgetMinutes));
  const [weight, setWeight] = useState(String(season.absenceWeightMinutes));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const body = () => ({
    code,
    program,
    year: Number(year),
    description: description.trim() === "" ? null : description,
    startDate: `${startDay}T00:00:00.000Z`,
    endDate: `${endDay}T00:00:00.000Z`,
    status,
    absenceBudgetMinutes: Number(budget),
    absenceWeightMinutes: Number(weight),
  });

  const save = () => {
    setMessage(null);
    // The server's own schema (spec 02 §8): slug rules, bounds, date order.
    const parsed = seasonWriteRequestSchema.safeParse(body());
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(body(), {
      // The code may have changed — every URL addressing the season moves (spec 02 D8).
      onSuccess: (ref) => router.replace({ pathname: "/seasons/[code]", params: { code: ref.code } }),
      onError: (err) => {
        // v1 parity 2026-10-09 (spec 02 R5): "Already in use." under Code beside the top message.
        setErrors(apiFieldErrors(err));
        setMessage(apiErrorMessage(err, "Couldn't save the season."));
      },
    });
  };

  const onDelete = (done: () => void) => {
    setMessage(null);
    remove.mutate(season.id, {
      onSuccess: () => router.replace("/seasons"),
      onError: (err) => {
        done();
        setMessage(apiErrorMessage(err, "Couldn't delete the season."));
      },
    });
  };

  return (
    <>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">{`Edit ${season.title}`}</Text>
        <Input label="Code" value={code} onChangeText={setCode} autoCapitalize="none" error={errors.code} />
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`Saved as: ${slugifySeasonCode(code || `${program} ${year}`)}`}
        </Text>
        <Input label="Program" value={program} onChangeText={setProgram} error={errors.program} />
        <Input label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" error={errors.year} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline error={errors.description} />
        <Input label="Start date (YYYY-MM-DD)" value={startDay} onChangeText={setStartDay} autoCapitalize="none" error={errors.startDate} />
        <Input label="End date (YYYY-MM-DD)" value={endDay} onChangeText={setEndDay} autoCapitalize="none" error={errors.endDate} />
        <Input label="Absence budget (minutes)" value={budget} onChangeText={setBudget} keyboardType="number-pad" error={errors.absenceBudgetMinutes} />
        <Input label="Absence weight (minutes)" value={weight} onChangeText={setWeight} keyboardType="number-pad" error={errors.absenceWeightMinutes} />
        <Text variant="label">Status</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {seasonStatusSchema.options.map((s) => (
            <Button key={s} title={s} variant={status === s ? "primary" : "secondary"} onPress={() => setStatus(s)} />
          ))}
        </View>
        {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
        <Button title="Save season" onPress={save} loading={update.isPending} />
      </Card>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Text variant="heading">Delete</Text>
        <DeleteSeasonConfirm title={season.title} pending={remove.isPending} onDelete={onDelete} buttonTitle="Delete season" />
      </Card>
    </>
  );
}

export default function SeasonEditScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const code = isSuper && typeof raw === "string" && raw.length > 0 ? raw : null;
  const detail = useSeasonByCode(code);

  let body: ReactNode;
  if (!isSuper) {
    body = <EmptyState title="Not available" message="Only a super admin can edit a season's identity." />;
  } else if (code === null) {
    body = <EmptyState title="Not found" message="That season link isn't valid." />;
  } else if (detail.isPending) {
    body = <LoadingState />;
  } else if (detail.isError) {
    body = <ErrorState message="Couldn't load this season." onRetry={() => void detail.refetch()} />;
  } else {
    // key: a refetch after save must not keep the old form state.
    body = <SeasonEditForm key={`${detail.data.id}-${detail.data.code}`} season={detail.data} />;
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
