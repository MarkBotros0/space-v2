/**
 * The group import's paste → preview → apply state (refactor FE-005, as user-import's
 * use-student-import-flow). Editing the paste drops the preview; Apply sends only the rows the
 * preview marked `assign`; the result is the server's applied count, never the request's.
 */
import { useMemo, useState } from "react";
import type { GroupImportPreview, GroupImportResult } from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { useGroupImportCommit, useGroupImportPreview } from "../../hooks/use-import";
import { importErrorMessage } from "../../lib/import-error";

export function useGroupImportFlow(seasonId: number | null) {
  const [text, setTextRaw] = useState("");
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

  const setText = (t: string) => {
    setTextRaw(t);
    setPreview(null);
  };

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
          assignments: toAssign.map((r) => ({ studentUserId: r.studentUserId, groupId: r.groupId })),
        }),
      );
    } catch (err) {
      setError(importErrorMessage(err));
    }
  }

  /** Import another file: back to an empty paste. */
  const reset = () => {
    setResult(null);
    setPreview(null);
    setTextRaw("");
  };

  return {
    text,
    setText,
    error,
    preview,
    result,
    toAssign,
    previewMutation,
    commitMutation,
    runPreview,
    runCommit,
    reset,
  };
}
