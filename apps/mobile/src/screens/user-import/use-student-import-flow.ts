import { useMemo, useState } from "react";
import type {
  ImportRowStatus,
  StudentImportCommitInput,
  StudentImportPreview,
  StudentImportResult,
} from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { useStudentImportCommit, useStudentImportPreview } from "../../hooks/use-import";
import { importErrorMessage } from "../../lib/import-error";

/**
 * The `/users/import` flow's state: three steps in local state rather than
 * three routes (spec §9): the paste, the preview and the result all belong to
 * one operation, and splitting them across routes would mean either passing a
 * 2000-row preview through navigation params or holding it in a store that
 * outlives the screen.
 *
 * NOTHING here is persisted. No expo-secure-store, no AsyncStorage, no query
 * cache — a preview is a complete roster with phone numbers, birth dates and
 * pastoral notes (D-16.18). Leaving the route discards it, which is the
 * correct trade; the in-screen Back control is what an operator uses to fix a
 * paste, and it keeps the text.
 */
export type Step = "paste" | "preview" | "result";
export type Mode = "season" | "alumni";
export type Filter = "attention" | "all";

/** Default the filter to the rows that need attention (spec §10c). */
const ATTENTION: ImportRowStatus[] = ["invalid", "duplicate"];
/** The phone table is not virtualised; "All" on a 2000-row paste shows this many at a time. */
const PAGE_SIZE = 50;

export function useStudentImportFlow() {
  const [step, setStep] = useState<Step>("paste");
  const [mode, setMode] = useState<Mode>("season");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [graduationYear, setGraduationYear] = useState<string>(String(new Date().getUTCFullYear()));
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [filter, setFilterState] = useState<Filter>("attention");
  const [enrolExisting, setEnrolExisting] = useState(false);
  const [enrolConfirmed, setEnrolConfirmed] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  const previewMutation = useStudentImportPreview();
  const commitMutation = useStudentImportCommit();

  const enrolArmed = mode === "season" && enrolExisting && enrolConfirmed;
  const newRows = useMemo(() => preview?.rows.filter((r) => r.status === "new") ?? [], [preview]);
  // D-16.7: with `enroll` confirmed, rows already in the system are SENT too —
  // the server decides per row (enrol, already enrolled, staff, removed).
  // Unconfirmed, they are never sent.
  const existingRows = useMemo(
    () => (enrolArmed ? (preview?.rows.filter((r) => r.status === "exists") ?? []) : []),
    [preview, enrolArmed],
  );
  const importable = useMemo(() => [...newRows, ...existingRows], [newRows, existingRows]);
  const needsSeason = mode === "season" && seasonId === null;
  const visibleRows = useMemo(() => {
    if (!preview) return [];
    return filter === "all"
      ? preview.rows
      : preview.rows.filter((r) => ATTENTION.includes(r.status));
  }, [preview, filter]);

  /** Switching the filter starts the list again from its first page. */
  function setFilter(next: Filter) {
    setFilterState(next);
    setShownCount(PAGE_SIZE);
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
      setLocalError(importErrorMessage(err));
    }
  }

  async function runCommit() {
    if (!preview) return;
    setLocalError(null);
    const rows = importable.map((r) => ({ rowNumber: r.rowNumber, values: r.values }));
    if (rows.length === 0) return;

    // `status` is deliberately not sent: the server re-derives every
    // classification itself (D-16.4), so the client's opinion is not part of
    // the contract.
    const onExisting = enrolArmed ? ("enroll" as const) : ("skip" as const);
    let body: StudentImportCommitInput;
    if (mode === "season") {
      // Narrowed, not cast: the button is disabled without a season, and this
      // guard makes the type say so (the earlier draft sent `null as number`).
      if (seasonId === null) return;
      body = { mode: "season", seasonId, onExisting, rows };
    } else {
      body = { mode: "alumni", graduationYear: Number(graduationYear), onExisting: "skip", rows };
    }

    try {
      setResult(await commitMutation.mutateAsync(body));
      setStep("result");
    } catch (err) {
      setLocalError(importErrorMessage(err));
    }
  }

  /** "Import another file": back to an empty paste, enrolment disarmed. */
  function startOver() {
    setResult(null);
    setPreview(null);
    setText("");
    setEnrolExisting(false);
    setEnrolConfirmed(false);
    setStep("paste");
  }

  /** The enrol toggle: flipping it always asks for confirmation again. */
  function toggleEnrolExisting() {
    setEnrolExisting(!enrolExisting);
    setEnrolConfirmed(false);
  }

  return {
    step,
    setStep,
    mode,
    setMode,
    seasonId,
    setSeasonId,
    graduationYear,
    setGraduationYear,
    text,
    setText,
    localError,
    preview,
    result,
    filter,
    setFilter,
    shownCount,
    showMore: () => setShownCount((n) => n + PAGE_SIZE),
    enrolExisting,
    enrolConfirmed,
    toggleEnrolExisting,
    confirmEnrol: () => setEnrolConfirmed(true),
    newRows,
    existingRows,
    importable,
    needsSeason,
    visibleRows,
    runPreview,
    runCommit,
    startOver,
    previewPending: previewMutation.isPending,
    commitPending: commitMutation.isPending,
  };
}

export type StudentImportFlow = ReturnType<typeof useStudentImportFlow>;
