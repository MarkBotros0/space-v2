import { useRouter } from "expo-router";

import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
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
      <ShellFrame>
        <EmptyState
          title="Import profiles batch"
          description="This screen isn't available for your role."
        />
      </ShellFrame>
    );
  }

  const header = (
    <PageTitle
      title="Import profiles batch"
      subtitle="Bulk-create profiles from pasted rows with name and email columns. Choose whether to import them as active students in a season or as alumni of a graduation year. Invites are sent separately once you're ready."
    />
  );

  if (flow.step === "result" && flow.result) {
    return (
      <ShellFrame>
        <ImportResultStep
          header={header}
          result={flow.result}
          onViewUsers={() => router.push("/users")}
          onStartOver={flow.startOver}
        />
      </ShellFrame>
    );
  }

  if (flow.step === "preview" && flow.preview) {
    return (
      <ShellFrame>
        <ImportPreviewStep header={header} preview={flow.preview} flow={flow} />
      </ShellFrame>
    );
  }

  if (template.isLoading) {
    return (
      <ShellFrame>
        <RouteSkeleton />
      </ShellFrame>
    );
  }
  if (template.isError) {
    return (
      <ShellFrame>
        <RouteError onRetry={() => void template.refetch()} />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame>
      <ImportPasteStep header={header} flow={flow} template={template} seasons={seasons} />
    </ShellFrame>
  );
}
