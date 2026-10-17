import { useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import type {
  ImportRowStatus,
  StudentImportCommitInput,
  StudentImportPreview,
  StudentImportResult,
} from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { FormErrorBox } from "../../../src/design/forms/form-parts";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../src/design/lib/icon";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
  type DataTableColumn,
} from "../../../src/design/ui";
import { cn } from "../../../src/design/lib/cn";
import {
  useImportTemplate,
  useStudentImportCommit,
  useStudentImportPreview,
} from "../../../src/hooks/use-import";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../src/store/session";

iconWithClassName(CheckCircle2);

type PreviewRow = StudentImportPreview["rows"][number];

/**
 * `/users/import` — v1 super/users/import ("Import profiles batch",
 * student-import-form.tsx) as v2's three-step paste flow (uploads stay off,
 * owner decision 2, 2026-10-10).
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
/** The phone table is not virtualised; "All" on a 2000-row paste shows this many at a time. */
const PAGE_SIZE = 50;

const STATUS_BADGE: Record<
  ImportRowStatus,
  { variant: "success" | "warning" | "error"; label: string }
> = {
  new: { variant: "success", label: "New" },
  exists: { variant: "warning", label: "Skip · already here" },
  duplicate: { variant: "warning", label: "Skip · repeated" },
  invalid: { variant: "error", label: "Invalid" },
  previously_removed: { variant: "warning", label: "Skip · removed" },
};

const CURRENT_YEAR = new Date().getFullYear();

function messageFor(err: unknown): string {
  const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
    ?.error;
  return body?.message ?? "Something went wrong. Try again.";
}

/** v1's two "Import as" tiles: `flex-1 rounded-lg border px-4 py-3`. */
function ModeTile({
  title,
  caption,
  selected,
  onPress,
}: {
  title: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "rounded-lg border px-4 py-3",
        selected
          ? "border-brand-teal-500 bg-brand-teal-50 dark:bg-brand-teal-950"
          : "border-border bg-card active:bg-accent",
      )}
    >
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <Text className="text-xs text-muted-foreground">{caption}</Text>
    </Pressable>
  );
}

export default function ImportScreen() {
  const router = useRouter();
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
  const [enrolExisting, setEnrolExisting] = useState(false);
  const [enrolConfirmed, setEnrolConfirmed] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  const template = useImportTemplate(isSuper);
  // Plan 4's hook — the same cached list the seasons screen reads.
  const seasons = useSeasons(isSuper);
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
      setShownCount(PAGE_SIZE);
      setStep("preview");
    } catch (err) {
      setLocalError(messageFor(err));
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
      setLocalError(messageFor(err));
    }
  }

  const header = (
    <PageTitle
      title="Import profiles batch"
      subtitle="Bulk-create profiles from pasted rows with name and email columns. Choose whether to import them as active students in a season or as alumni of a graduation year. Invites are sent separately once you're ready."
    />
  );

  // ── Step 3 ───────────────────────────────────────────────────────────────
  if (step === "result" && result) {
    const notCreated = result.rows.filter((r) => r.outcome !== "created");
    return (
      <ShellFrame>
        <View className="flex-col gap-4">
          {header}
          <View className="flex-row items-start gap-3 rounded-lg bg-success-50 px-4 py-3 dark:bg-success-950">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success-600" />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-success-800 dark:text-success-200">
                Import complete
              </Text>
              <Text className="text-sm text-success-700 dark:text-success-300">
                {`${result.created} created · ${result.enrolled} enrolled · ${result.skipped} skipped`}
              </Text>
              {/* Spec R55: import sends nothing. Invites go from the users screen. */}
              <Text className="mt-1 text-sm text-success-700 dark:text-success-300">
                No invites were sent. New accounts have no way to sign in until you invite them from
                the users screen.
              </Text>
            </View>
          </View>
          <Text className="text-xs text-muted-foreground">
            It is safe to run the same paste again — anyone already in the system is skipped, never
            duplicated.
          </Text>
          {notCreated.map((r) => (
            <View key={r.rowNumber} className="rounded-lg border border-border bg-card p-3">
              <Text className="text-sm font-medium">{`Row ${r.rowNumber} · ${r.email}`}</Text>
              <Text className="text-xs text-muted-foreground">{r.message ?? r.outcome}</Text>
            </View>
          ))}
          <View className="flex-col gap-2">
            <Button onPress={() => router.push("/users")}>View users</Button>
            <Button
              variant="outline"
              onPress={() => {
                setResult(null);
                setPreview(null);
                setText("");
                setEnrolExisting(false);
                setEnrolConfirmed(false);
                setStep("paste");
              }}
            >
              Import another file
            </Button>
          </View>
        </View>
      </ShellFrame>
    );
  }

  // ── Step 2 ───────────────────────────────────────────────────────────────
  if (step === "preview" && preview) {
    const shown = visibleRows.slice(0, shownCount);
    const columns: DataTableColumn<PreviewRow>[] = [
      {
        key: "name",
        header: "Name",
        cell: (r) => <Text className="font-medium">{r.name || "—"}</Text>,
      },
      {
        key: "email",
        header: "Email",
        cell: (r) => <Text className="text-muted-foreground">{r.email || "—"}</Text>,
      },
      { key: "row", header: "Row", cell: (r) => `Row ${r.rowNumber}` },
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
    return (
      <ShellFrame>
        <View className="flex-col gap-4">
          {header}
          <Card>
            <CardContent className="pt-6">
              <View className="flex-col gap-3">
                <Text className="text-sm text-muted-foreground">
                  {`${preview.counts.total} rows · ${preview.counts.new} new · ${preview.counts.exists} already here · ${preview.counts.duplicate} repeated · ${preview.counts.invalid} invalid`}
                </Text>
                {preview.counts.previously_removed > 0 ? (
                  <Text className="text-xs text-muted-foreground">
                    {`${preview.counts.previously_removed} previously removed — restore those from the users screen.`}
                  </Text>
                ) : null}
                <Text className="text-xs text-muted-foreground">
                  {`Read as ${preview.delimiter === "tab" ? "tab" : "comma"}-separated · columns: ${preview.detectedColumns.join(", ")}`}
                </Text>
                {preview.unrecognisedColumns.length > 0 ? (
                  <View className="rounded-md bg-warning-50 px-3 py-2 dark:bg-warning-950">
                    {/* D-16.12: v1 never says what it FAILED to detect, which is the half that matters. */}
                    <Text className="text-sm font-medium text-warning-800 dark:text-warning-200">
                      {`${preview.unrecognisedColumns.length} column(s) not recognised`}
                    </Text>
                    <Text className="text-xs text-warning-700 dark:text-warning-300">
                      {`${preview.unrecognisedColumns.map((c) => `"${c}"`).join(", ")} — these were ignored.`}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row gap-2">
                  <Button
                    size="sm"
                    variant={filter === "attention" ? "default" : "outline"}
                    onPress={() => {
                      setFilter("attention");
                      setShownCount(PAGE_SIZE);
                    }}
                  >
                    Needs attention
                  </Button>
                  <Button
                    size="sm"
                    variant={filter === "all" ? "default" : "outline"}
                    onPress={() => {
                      setFilter("all");
                      setShownCount(PAGE_SIZE);
                    }}
                  >
                    All
                  </Button>
                </View>
                {shown.length === 0 ? (
                  <EmptyState title="Nothing to show" description="No rows match this filter." />
                ) : (
                  <DataTable columns={columns} rows={shown} rowKey={(r) => r.rowNumber} />
                )}
                {visibleRows.length > shownCount ? (
                  <Button variant="outline" onPress={() => setShownCount((n) => n + PAGE_SIZE)}>
                    {`Show more (${visibleRows.length - shownCount} left)`}
                  </Button>
                ) : null}
                {mode === "season" ? (
                  <View className="flex-col gap-2">
                    <Button
                      variant={enrolExisting ? "default" : "outline"}
                      onPress={() => {
                        setEnrolExisting(!enrolExisting);
                        setEnrolConfirmed(false);
                      }}
                    >
                      Also enrol people already in the system
                    </Button>
                    {enrolExisting && !enrolConfirmed ? (
                      <View className="flex-col gap-2">
                        {/* D-16.7: `enroll` changes existing records, so it is never armed by the toggle alone. */}
                        <Text className="text-xs text-muted-foreground">
                          {`This will also enrol ${preview.counts.exists} existing student(s) into this season. Their names, notes and other details will not be changed.`}
                        </Text>
                        <Button onPress={() => setEnrolConfirmed(true)}>Yes, enrol them too</Button>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <FormErrorBox message={localError} />
                <Button
                  disabled={needsSeason || importable.length === 0 || commitMutation.isPending}
                  onPress={runCommit}
                >
                  {needsSeason
                    ? "Choose a season before importing"
                    : importable.length === 0
                      ? "Nothing to import"
                      : `Import ${newRows.length} student${newRows.length === 1 ? "" : "s"}${
                          existingRows.length > 0 ? `, enrol ${existingRows.length}` : ""
                        }`}
                </Button>
                <Button variant="outline" onPress={() => setStep("paste")}>
                  Back
                </Button>
              </View>
            </CardContent>
          </Card>
        </View>
      </ShellFrame>
    );
  }

  // ── Step 1 ───────────────────────────────────────────────────────────────
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

  const seasonItems: Record<string, string> = Object.fromEntries(
    (seasons.data ?? []).map((s) => [String(s.id), s.title]),
  );
  const yearNum = Number(graduationYear);
  const yearInvalid =
    graduationYear !== "" &&
    !(/^\d{4}$/.test(graduationYear) && yearNum >= 1990 && yearNum <= CURRENT_YEAR);

  return (
    <ShellFrame>
      <View className="flex-col gap-4">
        {header}
        <Card>
          <CardContent className="pt-6">
            <View className="flex-col gap-4">
              <FormField label="Import as" required>
                <View className="flex-col gap-2">
                  <ModeTile
                    title="Active students"
                    caption="Enroll in a season"
                    selected={mode === "season"}
                    onPress={() => setMode("season")}
                  />
                  <ModeTile
                    title="Alumni"
                    caption="Graduated, no season"
                    selected={mode === "alumni"}
                    onPress={() => setMode("alumni")}
                  />
                </View>
              </FormField>

              {mode === "season" ? (
                // Preview stays enabled without a season — the target is only needed at
                // commit — but the commit button is disabled until one is chosen. Draft and
                // archived seasons are listed too: v1's picker offers every non-deleted
                // season (spec 16 R37).
                seasons.isPending ? (
                  <RouteSkeleton />
                ) : seasons.isError ? (
                  <RouteError onRetry={() => void seasons.refetch()} />
                ) : (seasons.data ?? []).length === 0 ? (
                  <View className="rounded-md bg-warning-50 px-3 py-2 dark:bg-warning-950">
                    <Text className="text-sm text-warning-800 dark:text-warning-200">
                      No seasons yet — create a season first, or import these people as alumni
                      instead.
                    </Text>
                  </View>
                ) : (
                  <FormField label="Season" required>
                    <Select
                      items={seasonItems}
                      value={seasonId === null ? null : String(seasonId)}
                      onValueChange={(v) => setSeasonId(Number(v))}
                    >
                      <SelectTrigger accessibilityLabel="Season">
                        <SelectValue placeholder="Choose the season to enroll students in" />
                      </SelectTrigger>
                      <SelectContent>
                        {(seasons.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )
              ) : (
                <FormField
                  label="JPCS graduation year"
                  required
                  error={yearInvalid ? `Enter a year between 1990 and ${CURRENT_YEAR}.` : undefined}
                >
                  <Input
                    accessibilityLabel="Graduation year"
                    value={graduationYear}
                    onChangeText={setGraduationYear}
                    keyboardType="number-pad"
                  />
                </FormField>
              )}

              <FormField label="Paste your spreadsheet" required>
                <Textarea
                  accessibilityLabel="Paste your spreadsheet"
                  className="min-h-40"
                  value={text}
                  onChangeText={setText}
                  placeholder={template.data?.headerRow}
                  autoCapitalize="none"
                />
                <View className="mt-1 flex-col gap-0.5">
                  <Text className="text-xs font-medium text-muted-foreground">
                    Columns we recognise
                  </Text>
                  {template.data?.columns.map((c) => (
                    <Text key={c.label} className="text-xs text-muted-foreground">
                      {`${c.label}${c.required ? " (required)" : ""} — ${c.acceptedHeaders.join(", ")}`}
                    </Text>
                  ))}
                  <Text selectable className="text-xs text-muted-foreground">
                    {template.data?.headerRow}
                  </Text>
                </View>
              </FormField>

              {template.data?.capabilities.fileUpload === false ? (
                <Text className="text-xs text-muted-foreground">
                  Pasting is the only way in right now — file upload arrives with the CMS.
                </Text>
              ) : null}

              <FormErrorBox message={localError} />
              <Button variant="outline" disabled={previewMutation.isPending} onPress={runPreview}>
                {previewMutation.isPending ? "Reading…" : "Preview"}
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>
    </ShellFrame>
  );
}
