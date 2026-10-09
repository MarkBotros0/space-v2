// apps/mobile/app/(app)/users/import.tsx
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import type {
  ImportRowStatus,
  StudentImportCommitInput,
  StudentImportPreview,
  StudentImportResult,
} from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { ImportRowCard } from "../../../src/components/ImportRowCard";
import { useImportTemplate, useStudentImportCommit, useStudentImportPreview } from "../../../src/hooks/use-import";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

/**
 * `/users/import` — the whole importer in one route.
 *
 * Three steps in local state rather than three routes (spec §9): the paste,
 * the preview and the result all belong to one operation, and splitting them
 * across routes would mean either passing a 2000-row preview through
 * navigation params or holding it in a store that outlives the screen.
 *
 * NOTHING here is persisted. No expo-secure-store, no AsyncStorage, no query
 * cache — a preview is a complete roster with phone numbers, birth dates and
 * pastoral notes (D-16.18). Leaving the route discards it, which is the
 * correct trade; the in-screen Back control is what an operator uses to fix a
 * paste, and it keeps the text.
 */
type Step = "paste" | "preview" | "result";
type Mode = "season" | "alumni";

/** Default the filter to the rows that need attention (spec §10c). */
const ATTENTION: ImportRowStatus[] = ["invalid", "duplicate"];

function messageFor(err: unknown): string {
  const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
  return body?.message ?? "Something went wrong. Try again.";
}

export default function ImportScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isSuper = role === "SUPER";

  const [step, setStep] = useState<Step>("paste");
  const [mode, setMode] = useState<Mode>("season");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [graduationYear, setGraduationYear] = useState<string>(String(new Date().getUTCFullYear()));
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [filter, setFilter] = useState<"attention" | "all">("attention");

  const template = useImportTemplate(isSuper);
  // Plan 4's hook — the same cached list the seasons screen reads.
  const seasons = useSeasons(isSuper);
  const previewMutation = useStudentImportPreview();
  const commitMutation = useStudentImportCommit();

  // Only `new` rows are sent, as v1 (R34); an existing user is always skipped
  // and never enrolled (R44 / D-16.7).
  const newRows = useMemo(() => preview?.rows.filter((r) => r.status === "new") ?? [], [preview]);
  const needsSeason = mode === "season" && seasonId === null;
  const visibleRows = useMemo(() => {
    if (!preview) return [];
    return filter === "all" ? preview.rows : preview.rows.filter((r) => ATTENTION.includes(r.status));
  }, [preview, filter]);

  if (!isSuper) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState
          title="Import students"
          message="This screen isn't available for your role."
        />
      </Screen>
    );
  }

  async function runPreview() {
    setLocalError(null);
    if (text.trim() === "") {
      setLocalError("Paste a header row and at least one data row first.");
      return;
    }
    // Checked here so an oversized paste never costs a request; the server
    // checks again, because a client-side limit is a courtesy (D-16.10).
    if (text.length > IMPORT_MAX_PASTE_CHARS) {
      setLocalError("That paste is too long. Import it in smaller batches.");
      return;
    }
    try {
      const next = await previewMutation.mutateAsync({ text, delimiter: "auto" });
      setPreview(next);
      setFilter("attention");
      setStep("preview");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  async function runCommit() {
    if (!preview) return;
    setLocalError(null);
    const rows = newRows.map((r) => ({ rowNumber: r.rowNumber, values: r.values }));
    if (rows.length === 0) return;

    // `status` is deliberately not sent: the server re-derives every
    // classification itself (D-16.4), so the client's opinion is not part of
    // the contract.
    let body: StudentImportCommitInput;
    if (mode === "season") {
      // Narrowed, not cast: the button is disabled without a season, and this
      // guard makes the type say so (the earlier draft sent `null as number`).
      if (seasonId === null) return;
      body = { mode: "season", seasonId, rows };
    } else {
      body = { mode: "alumni", graduationYear: Number(graduationYear), rows };
    }

    try {
      setResult(await commitMutation.mutateAsync(body));
      setStep("result");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  // ── Step 3 ───────────────────────────────────────────────────────────────
  if (step === "result" && result) {
    const notCreated = result.rows.filter((r) => r.outcome !== "created");
    return (
      <Screen scroll edges={["top", "left", "right"]}>
        <Text variant="heading">Import complete</Text>
        <Text variant="body">
          {`${result.created} created · ${result.skipped} skipped · ${result.failed} failed`}
        </Text>
        {/* Spec R55: import sends nothing. Plan 9's single-target invite is
            the only invite path that exists; bulk invites are still deferred,
            so this says so rather than offering a button that 404s. */}
        <Text variant="body" color={theme.colors.neutral[600]}>
          No invites were sent. New accounts have no way to sign in until you invite them from the users screen.
        </Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          It is safe to run the same paste again — anyone already in the system is skipped, never duplicated.
        </Text>
        {/* Per-row report, as v1 (R54): skipped and failed rows with their
            messages. A failed row did not stop the rows after it (R45). */}
        {notCreated.map((r) => (
          <Card key={r.rowNumber} style={{ marginTop: theme.spacing.sm }}>
            <Text variant="label">{`Row ${r.rowNumber} · ${r.email}`}</Text>
            <Text
              variant="caption"
              color={r.outcome === "failed" ? theme.colors.error[600] : theme.colors.neutral[600]}
            >
              {r.message ?? r.outcome}
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

  // ── Step 2 ───────────────────────────────────────────────────────────────
  if (step === "preview" && preview) {
    return (
      // padded={false} + FlatList, NOT <Screen scroll>: Screen's scroll branch
      // is a ScrollView, and a FlatList inside one loses virtualisation and
      // warns. A 2000-row preview needs the virtualisation.
      <Screen edges={["top", "left", "right"]} padded={false}>
        <FlatList
          data={visibleRows}
          keyExtractor={(r) => String(r.rowNumber)}
          contentContainerStyle={{ padding: theme.spacing.md }}
          renderItem={({ item }) => <ImportRowCard row={item} />}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <Card>
                <Text variant="heading">{`${preview.counts.total} rows`}</Text>
                <Text variant="body">
                  {`${preview.counts.new} new · ${preview.counts.exists} already here · ${preview.counts.duplicate} repeated · ${preview.counts.invalid} invalid`}
                </Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`Read as ${preview.delimiter === "tab" ? "tab" : "comma"}-separated · columns: ${preview.detectedColumns.join(", ")}`}
                </Text>
              </Card>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Button title="Needs attention" variant={filter === "attention" ? "primary" : "secondary"} onPress={() => setFilter("attention")} />
                <Button title="All" variant={filter === "all" ? "primary" : "secondary"} onPress={() => setFilter("all")} />
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState title="Nothing to show" message="No rows match this filter." />
          }
          ListFooterComponent={
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}
              <Button
                title={
                  needsSeason
                    ? "Choose a season before importing"
                    : newRows.length === 0
                      ? "Nothing to import"
                      : `Import ${newRows.length} student${newRows.length === 1 ? "" : "s"}`
                }
                onPress={runCommit}
                disabled={needsSeason || newRows.length === 0 || commitMutation.isPending}
              />
              <Button title="Back" variant="secondary" onPress={() => setStep("paste")} />
            </View>
          }
        />
      </Screen>
    );
  }

  // ── Step 1 ───────────────────────────────────────────────────────────────
  if (template.isLoading) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (template.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load the import columns." onRetry={() => void template.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={["top", "left", "right"]}>
      <Text variant="heading">Import students</Text>

      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Into a season" variant={mode === "season" ? "primary" : "secondary"} onPress={() => setMode("season")} />
        <Button title="As alumni" variant={mode === "alumni" ? "primary" : "secondary"} onPress={() => setMode("alumni")} />
      </View>

      {mode === "alumni" ? (
        <Input label="Graduation year" value={graduationYear} onChangeText={setGraduationYear} keyboardType="number-pad" />
      ) : null}
      {mode === "season" ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="label">Season</Text>
          {/* Preview stays enabled without a season — the target is only
              needed at commit — but the commit button is disabled until one
              is chosen. Draft and archived seasons are listed too: v1's
              picker offers every non-deleted season (spec 16 R37). */}
          {seasons.isPending ? (
            <LoadingState />
          ) : seasons.isError ? (
            <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />
          ) : (seasons.data ?? []).length === 0 ? (
            <EmptyState title="No seasons" message="Create a season before importing into one." />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
              {(seasons.data ?? []).map((s) => (
                <Button
                  key={s.id}
                  title={s.title}
                  accessibilityLabel={`Target season: ${s.title}`}
                  variant={seasonId === s.id ? "primary" : "secondary"}
                  onPress={() => setSeasonId(s.id)}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}

      <Input
        label="Paste your spreadsheet"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={8}
        placeholder={template.data?.headerRow}
      />

      <Card>
        <Text variant="label">Columns we recognise</Text>
        {template.data?.columns.map((c) => (
          <Text key={c.label} variant="caption" color={theme.colors.neutral[600]}>
            {`${c.label}${c.required ? " (required)" : ""} — ${c.acceptedHeaders.join(", ")}`}
          </Text>
        ))}
        <Text variant="caption" color={theme.colors.neutral[600]} selectable>
          {template.data?.headerRow}
        </Text>
      </Card>

      {template.data?.capabilities.fileUpload === false ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Pasting is the only way in right now — file upload arrives with the CMS.
        </Text>
      ) : null}

      {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}

      <Button title="Preview" onPress={runPreview} disabled={previewMutation.isPending} />
    </Screen>
  );
}
