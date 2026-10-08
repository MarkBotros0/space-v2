import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import type { GroupImportPreview, GroupImportResult } from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { useGroupImportCommit, useGroupImportPreview } from "../../../../../src/hooks/use-import";
import { useSeasons } from "../../../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../../../src/store/session";
import { useTheme } from "../../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../../src/ui";

/**
 * `/seasons/[code]/roster/import` — bulk group assignment, three steps in
 * local state (paste → preview → result), exactly like `/users/import`.
 *
 * The season comes from the route's `code`, resolved against Plan 4's cached
 * `useSeasons` list; the endpoints take the id in the PATH (D-16.20), so
 * preview and commit cannot target different seasons. Gate: SUPER, or an
 * ADMIN of THIS season — the endpoints refuse anyone else regardless.
 */
type Step = "paste" | "preview" | "result";

function messageFor(err: unknown): string {
  const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
  return body?.message ?? "Something went wrong. Try again.";
}

export default function GroupImportScreen() {
  const theme = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const adminIds = useSessionStore((s) => s.scopes?.seasonAdminIds ?? []);

  const seasons = useSeasons(role === "SUPER" || role === "ADMIN");
  const season = useMemo(
    () => (seasons.data ?? []).find((s) => s.code === code) ?? null,
    [seasons.data, code],
  );
  const seasonId = season?.id ?? null;
  const allowed = role === "SUPER" || (role === "ADMIN" && seasonId !== null && adminIds.includes(seasonId));

  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GroupImportPreview | null>(null);
  const [result, setResult] = useState<GroupImportResult | null>(null);

  const previewMutation = useGroupImportPreview(seasonId);
  const commitMutation = useGroupImportCommit(seasonId);
  const toAssign = useMemo(
    () =>
      (preview?.rows ?? []).filter(
        (r): r is typeof r & { studentUserId: number; groupId: number } =>
          r.status === "assign" && r.studentUserId !== null && r.groupId !== null,
      ),
    [preview],
  );

  if (seasons.isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (seasons.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load the season." onRetry={() => void seasons.refetch()} />
      </Screen>
    );
  }
  if (!season || !allowed) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Import groups" message="This screen isn't available for this season." />
      </Screen>
    );
  }

  async function runPreview() {
    setLocalError(null);
    if (text.trim() === "") return setLocalError("Paste a header row and at least one data row first.");
    if (text.length > IMPORT_MAX_PASTE_CHARS) return setLocalError("That paste is too long. Import it in smaller batches.");
    try {
      setPreview(await previewMutation.mutateAsync({ text, delimiter: "auto" }));
      setStep("preview");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  async function runCommit() {
    setLocalError(null);
    if (toAssign.length === 0) return;
    try {
      setResult(
        await commitMutation.mutateAsync({
          assignments: toAssign.map((r) => ({ studentUserId: r.studentUserId, groupId: r.groupId })),
        }),
      );
      setStep("result");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  if (step === "result" && result && preview) {
    const skipped = new Set(result.skippedStudentIds);
    const skippedRows = preview.rows.filter((r) => r.studentUserId !== null && skipped.has(r.studentUserId));
    return (
      <Screen scroll edges={["top", "left", "right"]}>
        <Text variant="heading">Groups updated</Text>
        {/* The APPLIED count from the server (spec R80/D5), never the request. */}
        <Text variant="body">{`${result.assigned} assigned · ${result.skipped} skipped`}</Text>
        {skippedRows.map((r) => (
          <Card key={r.rowNumber} style={{ marginTop: theme.spacing.sm }}>
            <Text variant="label">{`Row ${r.rowNumber} · ${r.email}`}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              Not placed — no active enrolment in this season.
            </Text>
          </Card>
        ))}
        <Button
          title="Import another"
          onPress={() => {
            setResult(null);
            setPreview(null);
            setText("");
            setStep("paste");
          }}
        />
      </Screen>
    );
  }

  if (step === "preview" && preview) {
    const notMatched = preview.counts.no_student + preview.counts.no_group + preview.counts.invalid;
    return (
      <Screen edges={["top", "left", "right"]} padded={false}>
        <FlatList
          data={preview.rows}
          keyExtractor={(r) => String(r.rowNumber)}
          contentContainerStyle={{ padding: theme.spacing.md }}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="label">{`${item.name || item.email} → ${item.group || "—"}`}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {`Row ${item.rowNumber} · ${item.status}${item.message ? ` · ${item.message}` : ""}`}
              </Text>
            </Card>
          )}
          ListHeaderComponent={
            <Card style={{ marginBottom: theme.spacing.md }}>
              <Text variant="body">
                {`${preview.counts.assign} to assign · ${preview.counts.unchanged} unchanged · ${notMatched} not matched`}
              </Text>
            </Card>
          }
          ListFooterComponent={
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}
              <Button
                title={toAssign.length === 0 ? "Nothing to assign" : `Assign ${toAssign.length} student${toAssign.length === 1 ? "" : "s"}`}
                onPress={runCommit}
                disabled={toAssign.length === 0 || commitMutation.isPending}
              />
              <Button title="Back" variant="secondary" onPress={() => setStep("paste")} />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={["top", "left", "right"]}>
      <Text variant="heading">{`Import groups · ${season.title}`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Paste two columns, "email" and "group". A blank group cell is left alone.
      </Text>
      <Input
        label="Paste your spreadsheet"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={8}
        placeholder={"email\tgroup"}
      />
      {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}
      <Button title="Preview" onPress={runPreview} disabled={previewMutation.isPending} />
    </Screen>
  );
}
