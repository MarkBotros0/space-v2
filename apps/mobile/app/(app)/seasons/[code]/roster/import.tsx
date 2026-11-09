import { useLocalSearchParams } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type { GroupImportPreview, GroupImportResult } from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { FormErrorBox } from "../../../../../src/design/forms/form-parts";
import { FormScreen } from "../../../../../src/design/layout/form-screen";
import { RouteError, RouteSkeleton } from "../../../../../src/design/layout/route-states";
import { Screen } from "../../../../../src/design/layout/screen";
import { iconWithClassName } from "../../../../../src/design/lib/icon";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FormField,
  Text,
  Textarea,
  type DataTableColumn,
} from "../../../../../src/design/ui";
import { useGroupImportCommit, useGroupImportPreview } from "../../../../../src/hooks/use-import";
import { useSeasons } from "../../../../../src/hooks/use-seasons";
import { importErrorMessage } from "../../../../../src/lib/import-error";
import { useSessionStore } from "../../../../../src/store/session";

iconWithClassName(CheckCircle2);

const TITLE = "Import group assignments";

type GroupImportPreviewRow = GroupImportPreview["rows"][number];

const STATUS_BADGE: Record<
  GroupImportPreviewRow["status"],
  { variant: "success" | "warning" | "error" | "outline"; label: string }
> = {
  assign: { variant: "success", label: "Assign" },
  unchanged: { variant: "outline", label: "Unchanged" },
  no_student: { variant: "error", label: "No match" },
  no_group: { variant: "warning", label: "No group" },
  invalid: { variant: "error", label: "Invalid" },
};

/**
 * v1 admin/season/[code]/roster/import (group-import-form.tsx). v1 uploads a
 * CSV/Excel; uploads stay off (owner decision 2, 2026-10-10), so the file
 * picker is the paste box v2 already had — same Preview → table → Apply flow.
 * The season comes from the route's `code`, resolved against Plan 4's cached
 * `useSeasons` list; the endpoints take the id in the PATH (D-16.20), so
 * preview and commit cannot target different seasons. Gate: SUPER, or an
 * ADMIN of THIS season — the endpoints refuse anyone else regardless.
 */
export default function GroupImportScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const adminIds = useSessionStore((s) => s.scopes?.seasonAdminIds ?? []);

  const seasons = useSeasons(role === "SUPER" || role === "ADMIN");
  const season = useMemo(() => (seasons.data ?? []).find((s) => s.code === code) ?? null, [seasons.data, code]);
  const seasonId = season?.id ?? null;
  const allowed = role === "SUPER" || (role === "ADMIN" && seasonId !== null && adminIds.includes(seasonId));

  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      <Screen title={TITLE}>
        <RouteSkeleton />
      </Screen>
    );
  }
  if (seasons.isError) {
    return (
      <Screen title={TITLE}>
        <RouteError onRetry={() => void seasons.refetch()} />
      </Screen>
    );
  }
  if (!season || !allowed) {
    return (
      <Screen title={TITLE}>
        <EmptyState title="Import groups" description="This screen isn't available for this season." />
      </Screen>
    );
  }

  async function runPreview() {
    setError(null);
    if (text.trim() === "") return setError("Paste a header row and at least one data row first.");
    if (text.length > IMPORT_MAX_PASTE_CHARS) return setError("That paste is too long. Import it in smaller batches.");
    try {
      setPreview(await previewMutation.mutateAsync({ text, delimiter: "auto" }));
    } catch (err) {
      setPreview(null);
      setError(importErrorMessage(err));
    }
  }

  async function runCommit() {
    setError(null);
    if (toAssign.length === 0) return;
    try {
      setResult(
        await commitMutation.mutateAsync({
          assignments: toAssign.map((r) => ({
            studentUserId: r.studentUserId,
            groupId: r.groupId,
          })),
        }),
      );
    } catch (err) {
      setError(importErrorMessage(err));
    }
  }

  const subtitle = `${season.title}. Paste rows with email and group columns. Students in this season are matched by email and moved into the named group; a blank group cell is left alone.`;

  if (result && preview) {
    const skipped = new Set(result.skippedStudentIds);
    const skippedRows = preview.rows.filter((r) => r.studentUserId !== null && skipped.has(r.studentUserId));
    return (
      <Screen title={TITLE} subtitle={subtitle}>
        <View className="flex-col gap-4">
          <View className="flex-row items-start gap-3 rounded-control bg-ok-soft px-4 py-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success-600" />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-success-800 dark:text-success-200">Assignments applied</Text>
              {/* The APPLIED count from the server (spec R80/D5), never the request. */}
              <Text className="text-sm text-success-700 dark:text-success-300">
                {`${result.assigned} assigned · ${result.skipped} skipped`}
              </Text>
            </View>
          </View>
          {skippedRows.map((r) => (
            <View key={r.rowNumber} className="rounded-group bg-surface p-3 dark:border dark:border-separator">
              <Text className="text-sm font-medium">{`Row ${r.rowNumber} · ${r.email}`}</Text>
              <Text className="text-xs text-muted-foreground">Not placed — no active enrolment in this season.</Text>
            </View>
          ))}
          <Button
            variant="outline"
            className="self-end"
            onPress={() => {
              setResult(null);
              setPreview(null);
              setText("");
            }}
          >
            Import another file
          </Button>
        </View>
      </Screen>
    );
  }

  const columns: DataTableColumn<GroupImportPreviewRow>[] = [
    {
      key: "row",
      header: "Row",
      cell: (r) => <Text className="text-muted-foreground">{String(r.rowNumber)}</Text>,
    },
    { key: "email", header: "Email", cell: (r) => r.email || "—" },
    {
      key: "group",
      header: "Group",
      cell: (r) => r.group || "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <View className="flex-col gap-0.5">
          <Badge variant={STATUS_BADGE[r.status].variant} className="self-start">
            {STATUS_BADGE[r.status].label}
          </Badge>
          {r.message ? <Text className="text-xs text-muted-foreground">{r.message}</Text> : null}
        </View>
      ),
    },
  ];

  const c = preview?.counts;
  const applyLabel = commitMutation.isPending
    ? "Applying…"
    : toAssign.length === 0
      ? "Nothing to assign"
      : `Apply ${toAssign.length} assignment${toAssign.length === 1 ? "" : "s"}`;
  return (
    <FormScreen
      title={TITLE}
      subtitle={subtitle}
      saveLabel={preview ? applyLabel : previewMutation.isPending ? "Reading…" : "Preview"}
      saving={preview ? commitMutation.isPending : previewMutation.isPending}
      saveHint={
        preview && toAssign.length === 0
          ? "No row can be assigned. Fix the sheet and preview again."
          : !preview && text.trim() === ""
            ? "Paste a header row and at least one data row first."
            : undefined
      }
      disabled={preview ? toAssign.length === 0 : text.trim() === ""}
      onSave={preview ? runCommit : runPreview}
    >
      <View className="flex-col gap-4">
        <FormField label="Paste your spreadsheet">
          <Textarea
            accessibilityLabel="Paste your spreadsheet"
            className="min-h-40"
            value={text}
            onChangeText={(t) => {
              setText(t);
              setPreview(null);
            }}
            placeholder="email | group"
            autoCapitalize="none"
          />
        </FormField>
        <FormErrorBox message={error} />
        {preview && c ? (
          <View className="flex-col gap-3">
            <Text className="text-sm text-muted-foreground">
              {`${c.total} rows · ${c.assign} to assign · ${c.unchanged} unchanged · ${c.no_student} no match · ${c.no_group} no group · ${c.invalid} invalid`}
            </Text>
            <DataTable columns={columns} rows={preview.rows} rowKey={(r) => r.rowNumber} />
            <Button
              variant="secondary"
              className="self-start"
              disabled={previewMutation.isPending}
              onPress={runPreview}
            >
              Preview again
            </Button>
          </View>
        ) : null}
      </View>
    </FormScreen>
  );
}
