/**
 * The admin's assignment form (spec "The admin's side"): Details and Parts
 * tabs under the title, switching at once, and one Save in the footer that
 * sends both. A refused Save opens the tab that needs fixing; a save the
 * server wants confirmed (it changes students' work) asks first.
 */
import { useState } from "react";
import { View } from "react-native";
import type { AssignmentWriteBody } from "@space/shared";

import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import { SegmentedControl } from "../../design/ui/segmented-control";
import { toAssignmentBody, type AssignmentFormValues } from "../../lib/assignment-form-values";
import { plural } from "../../lib/plural";
import {
  formIssues,
  reminderPreview,
  withoutPartIssue,
  type FormIssues,
  type SavedReminder,
} from "./assignment-form-model";
import { DetailsTab } from "./details-tab";
import { PartsTab } from "./parts-tab";
import { usePartsDraft } from "./use-parts-draft";

export { NEW_ASSIGNMENT_VALUES, valuesFromDetail, type AssignmentFormValues } from "../../lib/assignment-form-values";

type Tab = "details" | "parts";
type DetailsValues = Omit<AssignmentFormValues, "parts">;

const NO_ISSUES: FormIssues = { details: {}, partsList: null, byPart: {}, tabs: { details: 0, parts: 0 } };

/** "This changes work 3 students have done. Save anyway?" */
export function confirmMessage(students: number): string {
  return `This changes work ${plural(students, "student")} ${students === 1 ? "has" : "have"} done. Save anyway?`;
}

interface AssignmentFormProps {
  title: string;
  subtitle?: string;
  initial: AssignmentFormValues;
  /** The saved assignment's id (its video parts' questions hang off it); null for a new one. */
  assignmentId: number | null;
  /** The saved reminder with the server's line for it; null for a new assignment. */
  savedReminder: SavedReminder | null;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (body: AssignmentWriteBody) => void;
  /** The server asked to confirm a save that changes this many students' work. */
  confirm?: { students: number; onConfirm: () => void; onCancel: () => void } | null;
}

export function AssignmentForm({
  title,
  subtitle,
  initial,
  assignmentId,
  savedReminder,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  confirm = null,
}: AssignmentFormProps) {
  const { parts: initialParts, ...initialDetails } = initial;
  const [v, setV] = useState<DetailsValues>(initialDetails);
  const draft = usePartsDraft(initialParts);
  const [tab, setTab] = useState<Tab>("details");
  const [issues, setIssues] = useState<FormIssues>(NO_ISSUES);

  const set = <K extends keyof DetailsValues>(key: K, value: DetailsValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const parsed = toAssignmentBody({ ...v, parts: draft.parts });
    if (!parsed.success) {
      const next = formIssues(parsed.error, draft.parts);
      setIssues(next);
      // An issue on the hidden tab must not go unseen: open the tab that has one.
      if (next.tabs[tab] === 0) setTab(tab === "details" ? "parts" : "details");
      return;
    }
    setIssues(NO_ISSUES);
    onSubmit(parsed.data);
  };

  const hasIssues = issues.tabs.details + issues.tabs.parts > 0;
  // An issue with no field of its own (the whole form, the reminder switch) is the bar's hint itself.
  const unplaced = issues.details.form ?? issues.details.reminder;
  const saveHint = serverError ?? unplaced ?? (hasIssues ? "Fix what's marked on this tab." : undefined);

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      footer={<SaveBar label={submitLabel} onPress={submit} loading={submitting} hint={saveHint} />}
    >
      <View className="flex-col gap-6">
        <SegmentedControl
          options={[
            { value: "details", label: "Details" },
            {
              value: "parts",
              label: `Parts (${draft.parts.length})`,
              accessibilityLabel: `Parts, ${plural(draft.parts.length, "part")}`,
            },
          ]}
          value={tab}
          onChange={(t) => setTab(t as Tab)}
        />
        {tab === "details" ? (
          <DetailsTab
            v={v}
            set={set}
            errors={issues.details}
            reminderLine={reminderPreview(v, savedReminder, new Date())}
          />
        ) : (
          <PartsTab
            draft={draft}
            assignmentId={assignmentId}
            listError={issues.partsList}
            partErrors={issues.byPart}
            onPartEdited={(key) => setIssues((prev) => withoutPartIssue(prev, key))}
          />
        )}
      </View>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) confirm?.onCancel();
        }}
        title="Change students' work?"
        description={confirm === null ? undefined : confirmMessage(confirm.students)}
        confirmLabel="Save anyway"
        destructive
        pending={submitting}
        onConfirm={() => confirm?.onConfirm()}
      />
    </Screen>
  );
}
