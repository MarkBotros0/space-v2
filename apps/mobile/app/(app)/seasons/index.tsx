import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SeasonListItem } from "@space/shared";

import { useSeasons } from "../../../src/hooks/use-seasons";
import {
  useCreateSeason,
  useDeleteSeason,
  useDuplicateSeason,
} from "../../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

/**
 * SUPER's seasons list (v1 /super/seasons + /super/seasons/new inline). A row
 * opens the season by code (Plan 6); the SUPER identity/status edit screen
 * hangs off that detail. ADMIN and MENTOR may reach this route and see the
 * list read-only.
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
  const router = useRouter();
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
    <Card
      style={{ marginTop: theme.spacing.sm }}
      onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: season.code } })}
    >
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

/**
 * Program filter (G20; spec 02 §9 — "filters, not routes"). Client-side over
 * the role-scoped list already loaded (Plan 6 D-16.5). Exact string match,
 * v1 R44: "GBV" and "gbv" are different programs.
 */
function ProgramFilter({
  programs,
  value,
  onChange,
}: {
  programs: string[];
  value: string | null;
  onChange: (program: string | null) => void;
}) {
  const theme = useTheme();
  if (programs.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
      <Button title="All programs" variant={value === null ? "primary" : "secondary"} onPress={() => onChange(null)} />
      {programs.map((p) => (
        <Button key={p} title={p} variant={value === p ? "primary" : "secondary"} onPress={() => onChange(p)} />
      ))}
    </View>
  );
}

export default function SeasonsScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role !== null && STAFF_ROLES.has(role);
  const isSuper = role === "SUPER";
  const seasons = useSeasons(isStaff);
  const [program, setProgram] = useState<string | null>(null);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="The seasons list isn't available for your role." />
      </Screen>
    );
  }

  const programs = seasons.data
    ? Array.from(new Set(seasons.data.map((s) => s.program))).sort((a, b) => a.localeCompare(b))
    : [];
  const visible = seasons.data ? seasons.data.filter((s) => program === null || s.program === program) : [];
  const years = Array.from(new Set(visible.map((s) => s.year)));

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
        <>
          <ProgramFilter programs={programs} value={program} onChange={setProgram} />
          {years.map((year) => (
            <View key={year} style={{ marginBottom: theme.spacing.md }}>
              <Text variant="heading">{String(year)}</Text>
              {visible
                .filter((s) => s.year === year)
                .map((s) => (
                  <SeasonRow key={s.id} season={s} canWrite={isSuper} />
                ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
