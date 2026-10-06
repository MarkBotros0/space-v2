import { useState } from "react";
import { View } from "react-native";
import type { SeasonListItem } from "@space/shared";

import { useSeasons } from "../../src/hooks/use-seasons";
import {
  useCreateSeason,
  useDeleteSeason,
  useDuplicateSeason,
} from "../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../src/lib/api-error";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

/**
 * SUPER's seasons list (v1 /super/seasons + /super/seasons/new inline).
 * Rows do not navigate: opening an arbitrary season (seasons/[code]) and the
 * SUPER identity/status edit screen are Plan 6 (ruling X15). ADMIN and
 * MENTOR may reach this route and see the list read-only.
 */
const STAFF_ROLES = new Set(["SUPER", "ADMIN", "MENTOR"]);

function NewSeasonForm() {
  const theme = useTheme();
  const create = useCreateSeason();
  const [code, setCode] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    create.mutate(
      { code, program, year: Number(year), startDate, endDate, status: "DRAFT" },
      {
        onSuccess: (created) => setMessage(`Created ${created.code}.`),
        onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the season.")),
      },
    );
  };

  return (
    <Card style={{ marginBottom: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">New season</Text>
      <Input label="Code" value={code} onChangeText={setCode} autoCapitalize="none" />
      <Input label="Program" value={program} onChangeText={setProgram} />
      <Input label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" />
      {/* ISO text for now — a native date picker is polish, not this plan. */}
      <Input label="Start date" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
      <Input label="End date" value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Create season" onPress={submit} loading={create.isPending} />
    </Card>
  );
}

function DuplicateForm({ source }: { source: SeasonListItem }) {
  const theme = useTheme();
  const duplicate = useDuplicateSeason(source.id);
  const [year, setYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    duplicate.mutate(
      { year: Number(year), startDate, endDate },
      {
        onSuccess: (created) => setMessage(`Created ${created.code}.`),
        onError: (err) => setMessage(apiErrorMessage(err, "Couldn't duplicate the season.")),
      },
    );
  };

  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      <Input label="Copy year" value={year} onChangeText={setYear} keyboardType="number-pad" />
      <Input label="Copy start date" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
      <Input label="Copy end date" value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Create copy" onPress={submit} loading={duplicate.isPending} />
    </View>
  );
}

function SeasonRow({ season, canWrite }: { season: SeasonListItem; canWrite: boolean }) {
  const theme = useTheme();
  const remove = useDeleteSeason();
  const [duplicating, setDuplicating] = useState(false);
  // RN has no window.confirm; the first press arms, the second deletes.
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    remove.mutate(season.id, {
      onError: (err) => {
        setArmed(false);
        setMessage(apiErrorMessage(err, "Couldn't delete the season."));
      },
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{season.title}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>{`${season.code} · ${season.status}`}</Text>
      {canWrite ? (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <Button title="Duplicate" variant="secondary" onPress={() => setDuplicating((d) => !d)} />
          <Button title={armed ? "Really delete?" : "Delete"} variant="ghost" onPress={onDelete} loading={remove.isPending} />
        </View>
      ) : null}
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      {canWrite && duplicating ? <DuplicateForm source={season} /> : null}
    </Card>
  );
}

export default function SeasonsScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role !== null && STAFF_ROLES.has(role);
  const isSuper = role === "SUPER";
  const seasons = useSeasons(isStaff);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="The seasons list isn't available for your role." />
      </Screen>
    );
  }

  const years = seasons.data ? Array.from(new Set(seasons.data.map((s) => s.year))) : [];

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => void seasons.refetch()}
      refreshing={seasons.isRefetching}
    >
      {isSuper ? <NewSeasonForm /> : null}
      {seasons.isPending ? (
        <LoadingState />
      ) : seasons.isError ? (
        <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />
      ) : seasons.data.length === 0 ? (
        <EmptyState title="No seasons" message="There are no seasons yet." />
      ) : (
        years.map((year) => (
          <View key={year} style={{ marginBottom: theme.spacing.md }}>
            <Text variant="heading">{String(year)}</Text>
            {seasons.data
              .filter((s) => s.year === year)
              .map((s) => (
                <SeasonRow key={s.id} season={s} canWrite={isSuper} />
              ))}
          </View>
        ))
      )}
    </Screen>
  );
}
