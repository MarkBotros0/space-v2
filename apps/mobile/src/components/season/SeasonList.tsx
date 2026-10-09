import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type { SeasonListItem } from "@space/shared";

import { useDeleteSeason, useDuplicateSeason } from "../../hooks/use-season-writes";
import { apiErrorMessage, apiFieldErrors } from "../../lib/api-error";
import { addYearsIso, autoSeasonCode } from "../../lib/season-defaults";
import { useTheme } from "../../theme";
import { Button, Card, Input, Text } from "../../ui";

export interface ProgramSection {
  program: string;
  seasons: SeasonListItem[];
}

/**
 * v1's SeasonsList grouping (seasons-list.tsx:112-123; spec 02 R43, v1 parity
 * 2026-10-09): one section per program, sections in `localeCompare` order,
 * seasons inside a program `year` desc. The sort is stable, so seasons of one
 * year keep the server's order (status asc, startDate desc — R24).
 */
export function groupSeasonsByProgram(seasons: SeasonListItem[]): ProgramSection[] {
  const byProgram = new Map<string, SeasonListItem[]>();
  for (const s of seasons) byProgram.set(s.program, [...(byProgram.get(s.program) ?? []), s]);
  return [...byProgram.entries()]
    .map(([program, rows]) => ({ program, seasons: [...rows].sort((a, b) => b.year - a.year) }))
    .sort((a, b) => a.program.localeCompare(b.program));
}

/** v1 delete-season-button.tsx:30-35's copy. */
export const DELETE_SEASON_BODY =
  "The season will be hidden from lists. Existing groups, sessions, and attendance are preserved.";

/**
 * One confirm step with v1's copy (spec 02 R49): the first press asks, "Delete"
 * soft-deletes. The server never refuses on content (v1 R49).
 */
export function DeleteSeasonConfirm({
  title,
  pending,
  onDelete,
  buttonTitle = "Delete",
}: {
  title: string;
  pending: boolean;
  onDelete: (done: () => void) => void;
  buttonTitle?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  if (!open) return <Button title={buttonTitle} variant="ghost" onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
      <Text variant="label">{`Delete "${title}"?`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {DELETE_SEASON_BODY}
      </Text>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        <Button title="Delete" onPress={() => onDelete(() => setOpen(false))} loading={pending} />
      </View>
    </View>
  );
}

function DuplicateForm({ source }: { source: SeasonListItem }) {
  const theme = useTheme();
  const duplicate = useDuplicateSeason(source.id);
  // v1 duplicate-season-dialog.tsx:63-87: next year, dates one year on, code following the year.
  const nextYear = source.year + 1;
  const [year, setYear] = useState(String(nextYear));
  const [code, setCode] = useState(autoSeasonCode(source.program, nextYear));
  const [codeTouched, setCodeTouched] = useState(false);
  const [startDate, setStartDate] = useState(addYearsIso(source.startDate, 1));
  const [endDate, setEndDate] = useState(addYearsIso(source.endDate, 1));
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const onYear = (value: string) => {
    setYear(value);
    if (!codeTouched) setCode(autoSeasonCode(source.program, value));
  };
  const onCode = (value: string) => {
    setCodeTouched(true);
    setCode(value);
  };

  const submit = () => {
    setMessage(null);
    setFieldErrors({});
    duplicate.mutate(
      { year: Number(year), code: code.trim() === "" ? undefined : code, startDate, endDate },
      {
        onSuccess: (created) => setMessage(`Created ${created.code}.`),
        onError: (err) => {
          // v1 parity 2026-10-09 (spec 02 R5): "Already in use." under Code.
          setFieldErrors(apiFieldErrors(err));
          setMessage(apiErrorMessage(err, "Couldn't duplicate the season."));
        },
      },
    );
  };

  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      <Input label="Copy year" value={year} onChangeText={onYear} keyboardType="number-pad" />
      <Input label="Copy code" value={code} onChangeText={onCode} autoCapitalize="none" error={fieldErrors.code} />
      <Input label="Copy start date" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
      <Input label="Copy end date" value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Create copy" onPress={submit} loading={duplicate.isPending} />
    </View>
  );
}

export function SeasonRow({ season, canWrite }: { season: SeasonListItem; canWrite: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const remove = useDeleteSeason();
  const [duplicating, setDuplicating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card
      style={{ marginTop: theme.spacing.sm }}
      onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: season.code } })}
    >
      <Text variant="body">{season.title}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>{`${season.code} · ${season.status}`}</Text>
      {canWrite ? (
        <>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Button title="Duplicate" variant="secondary" onPress={() => setDuplicating((d) => !d)} />
          </View>
          <DeleteSeasonConfirm
            title={season.title}
            pending={remove.isPending}
            onDelete={(done) =>
              remove.mutate(season.id, {
                onSuccess: done,
                onError: (err) => {
                  done();
                  setMessage(apiErrorMessage(err, "Couldn't delete the season."));
                },
              })
            }
          />
        </>
      ) : null}
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      {canWrite && duplicating ? <DuplicateForm source={season} /> : null}
    </Card>
  );
}

/**
 * The program-grouped list (spec 02 R43). With `linkHeadings` each program
 * heading opens the SUPER by-program screen (R45).
 */
export function SeasonProgramSections({
  seasons,
  canWrite,
  linkHeadings,
}: {
  seasons: SeasonListItem[];
  canWrite: boolean;
  linkHeadings: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <>
      {groupSeasonsByProgram(seasons).map((section) => {
        const heading = (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing.sm }}>
            <Text variant="heading">{section.program}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${section.seasons.length} year${section.seasons.length === 1 ? "" : "s"}`}
            </Text>
          </View>
        );
        return (
          <View key={section.program} style={{ marginBottom: theme.spacing.md }}>
            {linkHeadings ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${section.program} seasons`}
                onPress={() => router.push({ pathname: "/seasons/program/[program]", params: { program: section.program } })}
              >
                {heading}
              </Pressable>
            ) : (
              heading
            )}
            {section.seasons.map((s) => (
              <SeasonRow key={s.id} season={s} canWrite={canWrite} />
            ))}
          </View>
        );
      })}
    </>
  );
}
