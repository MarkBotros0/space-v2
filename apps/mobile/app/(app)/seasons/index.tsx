import { useState } from "react";

import { SeasonProgramSections } from "../../../src/components/season/SeasonList";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useCreateSeason } from "../../../src/hooks/use-season-writes";
import { apiErrorMessage, apiFieldErrors } from "../../../src/lib/api-error";
import { autoSeasonCode } from "../../../src/lib/season-defaults";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

/**
 * SUPER's seasons list (v1 /super/seasons + /super/seasons/new inline). A row
 * opens the season by code (Plan 6); the SUPER identity/status edit screen
 * hangs off that detail. ADMIN and MENTOR may reach this route and see the
 * list read-only. Grouped by program as v1 (spec 02 R43, v1 parity 2026-10-09).
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
  // v1 season-form.tsx:97-105: the code follows program + year until it is edited by hand.
  const [codeTouched, setCodeTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const onProgram = (value: string) => {
    setProgram(value);
    if (!codeTouched) setCode(autoSeasonCode(value, year));
  };
  const onYear = (value: string) => {
    setYear(value);
    if (!codeTouched) setCode(autoSeasonCode(program, value));
  };
  const onCode = (value: string) => {
    setCodeTouched(true);
    setCode(value);
  };

  const submit = () => {
    setMessage(null);
    setFieldErrors({});
    create.mutate(
      { code, program, year: Number(year), startDate, endDate, status: "DRAFT" },
      {
        onSuccess: (created) => setMessage(`Created ${created.code}.`),
        onError: (err) => {
          // v1 parity 2026-10-09 (spec 02 R5): "Already in use." under Code beside the top message.
          setFieldErrors(apiFieldErrors(err));
          setMessage(apiErrorMessage(err, "Couldn't create the season."));
        },
      },
    );
  };

  return (
    <Card style={{ marginBottom: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">New season</Text>
      <Input label="Code" value={code} onChangeText={onCode} autoCapitalize="none" error={fieldErrors.code} />
      <Input label="Program" value={program} onChangeText={onProgram} />
      <Input label="Year" value={year} onChangeText={onYear} keyboardType="number-pad" />
      {/* ISO text for now — a native date picker is polish, not this plan. */}
      <Input label="Start date" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
      <Input label="End date" value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Create season" onPress={submit} loading={create.isPending} />
    </Card>
  );
}

export default function SeasonsScreen() {
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
        <SeasonProgramSections seasons={seasons.data} canWrite={isSuper} linkHeadings={isSuper} />
      )}
    </Screen>
  );
}
