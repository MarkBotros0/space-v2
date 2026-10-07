import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SeasonDetail } from "@space/shared";

import { useCurrentSeasonId, useSeasonDetail } from "../../src/hooks/use-seasons";
import { useUpdateSeason, type UpdateSeasonInput } from "../../src/hooks/use-season-writes";
import { StudentSeason } from "../../src/components/season/StudentSeason";
import { apiErrorMessage } from "../../src/lib/api-error";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

/**
 * The current-season workspace (v1 /admin/season, /student/season).
 *
 * Staff body (ADMIN with the allowlisted edit). The student branch is
 * `StudentSeason` (Plan 11); a route for any season other than the current one is Plan 6 (ruling X15).
 */
function EditSeason({ season }: { season: SeasonDetail }) {
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
      <Text variant="heading">Edit season</Text>
      <Input label="Description" value={description} onChangeText={setDescription} multiline />
      <Input label="Absence budget (minutes)" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
      <Input label="Absence weight (minutes)" value={weight} onChangeText={setWeight} keyboardType="number-pad" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Save changes" onPress={save} loading={update.isPending} />
    </Card>
  );
}

function StaffSeason() {
  const theme = useTheme();
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const current = useCurrentSeasonId();
  const detail = useSeasonDetail(current.seasonId);
  const canEdit = role === "ADMIN" || role === "SUPER";

  const handleRefresh = () => {
    if (current.seasonId !== null) void detail.refetch();
    else current.refetch();
  };

  let body: ReactNode;
  if (current.isPending) body = <LoadingState />;
  else if (current.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = <EmptyState title="No season" message="You aren't in a season right now." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError)
    body = <ErrorState message="Couldn't load this season." onRetry={() => void detail.refetch()} />;
  else {
    const s = detail.data;
    body = (
      <>
        <Card>
          <Text variant="title">{s.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{`${s.code} · ${s.status}`}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${formatDate(s.startDate)} – ${formatDate(s.endDate)}`}
          </Text>
          {s.description ? <Text variant="body">{s.description}</Text> : null}
          <Text variant="label">{`${s.sessionCount} sessions · ${s.studentCount} students`}</Text>
        </Card>
        <Card style={{ marginTop: theme.spacing.md }}>
          <Text variant="heading">Groups</Text>
          {s.groups.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>No groups yet.</Text>
          ) : (
            s.groups.map((g) => (
              <View key={g.id} style={{ marginTop: theme.spacing.sm }}>
                <Text variant="body">{g.name}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {g.leaderNames.length > 0
                    ? `${g.studentCount} students · ${g.leaderNames.join(", ")}`
                    : `${g.studentCount} students`}
                </Text>
              </View>
            ))
          )}
        </Card>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Button title="Calendar" variant="secondary" onPress={() => router.push("/calendar")} />
          <Button title="Assignments" variant="secondary" onPress={() => router.push("/assignments")} />
        </View>
        {canEdit ? <EditSeason season={s} /> : null}
      </>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={handleRefresh} refreshing={detail.isRefetching}>
      {body}
    </Screen>
  );
}

export default function SeasonScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Two components rather than one with branches: the student half reads
  // GET /me/season and the staff half reads useCurrentSeasonId +
  // GET /seasons/:id — different hooks, so dispatch before any are called.
  return role === "STUDENT" ? <StudentSeason /> : <StaffSeason />;
}
