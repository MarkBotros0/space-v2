import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";

import { FormErrorBox } from "../../../../../src/design/forms/form-parts";
import { FormScreen } from "../../../../../src/design/layout/form-screen";
import { RouteError, RouteSkeleton } from "../../../../../src/design/layout/route-states";
import { Screen } from "../../../../../src/design/layout/screen";
import { EmptyState, FormField, Textarea } from "../../../../../src/design/ui";
import { useSeasons } from "../../../../../src/hooks/use-seasons";
import { GroupImportPreviewStep } from "../../../../../src/screens/group-import/preview-step";
import { GroupImportResultStep } from "../../../../../src/screens/group-import/result-step";
import { useGroupImportFlow } from "../../../../../src/screens/group-import/use-group-import-flow";
import { useSessionStore, useRole } from "../../../../../src/store/session";

const TITLE = "Import group assignments";

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
  const role = useRole();
  const adminIds = useSessionStore((s) => s.scopes?.seasonAdminIds ?? []);

  const seasons = useSeasons(role === "SUPER" || role === "ADMIN");
  const season = useMemo(() => (seasons.data ?? []).find((s) => s.code === code) ?? null, [seasons.data, code]);
  const seasonId = season?.id ?? null;
  const allowed = role === "SUPER" || (role === "ADMIN" && seasonId !== null && adminIds.includes(seasonId));
  const flow = useGroupImportFlow(seasonId);
  const { text, preview, result, toAssign, previewMutation, commitMutation } = flow;

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

  const subtitle = `${season.title}. Paste rows with email and group columns. Students in this season are matched by email and moved into the named group; a blank group cell is left alone.`;

  if (result && preview) {
    return (
      <Screen title={TITLE} subtitle={subtitle}>
        <GroupImportResultStep preview={preview} result={result} onImportAnother={flow.reset} />
      </Screen>
    );
  }

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
      onSave={preview ? flow.runCommit : flow.runPreview}
    >
      <View className="flex-col gap-4">
        <FormField label="Paste your spreadsheet">
          <Textarea
            accessibilityLabel="Paste your spreadsheet"
            className="min-h-40"
            value={text}
            onChangeText={flow.setText}
            placeholder="email | group"
            autoCapitalize="none"
          />
        </FormField>
        <FormErrorBox message={flow.error} />
        {preview ? (
          <GroupImportPreviewStep
            preview={preview}
            rereading={previewMutation.isPending}
            onPreviewAgain={flow.runPreview}
          />
        ) : null}
      </View>
    </FormScreen>
  );
}
