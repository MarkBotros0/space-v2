import { useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
import { useImportTemplate } from "../../../src/hooks/use-import";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { ImportPasteStep } from "../../../src/screens/user-import/import-paste-step";
import { ImportPreviewStep } from "../../../src/screens/user-import/import-preview-step";
import { ImportResultStep } from "../../../src/screens/user-import/import-result-step";
import { useStudentImportFlow } from "../../../src/screens/user-import/use-student-import-flow";
import { useSessionStore } from "../../../src/store/session";

/**
 * `/users/import` — v1 super/users/import ("Import profiles batch",
 * student-import-form.tsx) as v2's three-step paste flow (uploads stay off,
 * owner decision 2, 2026-10-10). The steps live in local state, never
 * persisted — see useStudentImportFlow.
 */
const frame = {
  title: "Add in bulk",
  subtitle:
    "Paste one person per line: a name and an email is enough. Add them as students in a season or as alumni of a graduation year. Invites are sent separately once you're ready.",
} as const;

export default function ImportScreen() {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isSuper = role === "SUPER";

  const flow = useStudentImportFlow();
  const template = useImportTemplate(isSuper);
  // Plan 4's hook — the same cached list the seasons screen reads.
  const seasons = useSeasons(isSuper);

  if (!isSuper) {
    return (
      <Screen {...frame}>
        <EmptyState title="Not available" description="This screen isn't available for your role." />
      </Screen>
    );
  }

  // The title and its explanation sit in the Screen's large title; the steps
  // start at their cards.
  const header = null;

  if (flow.step === "result" && flow.result) {
    return (
      <Screen {...frame}>
        <ImportResultStep
          header={header}
          result={flow.result}
          onViewUsers={() => router.push("/community")}
          onStartOver={flow.startOver}
        />
      </Screen>
    );
  }

  if (flow.step === "preview" && flow.preview) {
    return (
      <Screen {...frame}>
        <ImportPreviewStep header={header} preview={flow.preview} flow={flow} />
      </Screen>
    );
  }

  if (template.isLoading) {
    return (
      <Screen {...frame}>
        <RouteSkeleton />
      </Screen>
    );
  }
  if (template.isError) {
    return (
      <Screen {...frame}>
        <RouteError onRetry={() => void template.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen {...frame}>
      <ImportPasteStep header={header} flow={flow} template={template} seasons={seasons} />
    </Screen>
  );
}
