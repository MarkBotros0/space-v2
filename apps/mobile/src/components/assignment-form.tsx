import { useState } from "react";
import { View } from "react-native";
import type { AssignmentWriteBody, SessionListItem } from "@space/shared";

import { FormScreen } from "../design/layout/form-screen";
import { Combobox, DatePicker, FormField, Input, PillButton, RichTextEditor, TimePicker } from "../design/ui";
import {
  dateToDay,
  dayToDate,
  partsToTime,
  timeToParts,
  toAssignmentBody,
  type AssignmentFormValues,
} from "../lib/assignment-form-values";
import { firstErrorByField } from "../lib/form-errors";
import { AssignmentTypeSection, FileSubmissionsSection } from "./assignment-form-sections";
import { formatDayKey } from "../lib/format";

export { NEW_ASSIGNMENT_VALUES, valuesFromDetail, type AssignmentFormValues } from "../lib/assignment-form-values";

/** Which control each schema issue lands on; anything else goes to the bar. */
const FIELD_OF_ISSUE: Record<string, string> = {
  title: "title",
  description: "description",
  dueDay: "due",
  dueTime: "due",
  sessionId: "session",
  forumMinWords: "forumMinWords",
  maxFileSizeMb: "maxFileSizeMb",
  allowedMimeCategories: "mime",
};

interface AssignmentFormProps {
  title: string;
  subtitle?: string;
  initial: AssignmentFormValues;
  sessions: SessionListItem[];
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (body: AssignmentWriteBody) => void;
}

export function AssignmentForm({
  title,
  subtitle,
  initial,
  sessions,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
}: AssignmentFormProps) {
  const [v, setV] = useState<AssignmentFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const isForum = v.type === "FORUM";

  const submit = () => {
    const parsed = toAssignmentBody(v);
    if (!parsed.success) {
      const byIssue = firstErrorByField(parsed.error);
      const next: Record<string, string> = {};
      for (const [key, message] of Object.entries(byIssue)) {
        const field = FIELD_OF_ISSUE[key] ?? "form";
        if (!(field in next)) next[field] = message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  const sessionOptions = sessions.map((s) => ({
    value: String(s.id),
    label: s.title,
    // The server's org-calendar day (X13), not startsAt in the device zone.
    description: formatDayKey(s.dayKey),
  }));
  const saveHint =
    serverError ?? errors.form ?? (Object.keys(errors).length > 0 ? "Fix the fields marked above." : undefined);

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      saveLabel={submitLabel}
      saving={submitting}
      saveHint={saveHint}
      onSave={submit}
    >
      <View className="flex-col gap-4">
        <FormField label="Title" required error={errors.title}>
          <Input
            accessibilityLabel="Title"
            value={v.title}
            onChangeText={(t) => set("title", t)}
            placeholder="e.g. Week 4 reflection"
          />
        </FormField>

        <FormField label="Description" error={errors.description}>
          <RichTextEditor
            value={v.description}
            onChange={(html) => set("description", html)}
            placeholder="Instructions, prompts, expectations…"
          />
        </FormField>

        <AssignmentTypeSection v={v} set={set} errors={errors} />

        <FormField label="Due date" error={errors.due}>
          <DatePicker
            accessibilityLabel="Due date"
            value={dayToDate(v.dueDay)}
            onChange={(d) => set("dueDay", dateToDay(d))}
          />
          {v.dueDay !== null ? (
            // V2-only (R19/C2): v1 could not unset a due date once picked.
            <PillButton label="Clear due date" className="self-start" onPress={() => set("dueDay", null)} />
          ) : null}
        </FormField>
        <FormField label="Due time" description="Times are on the organisation's clock, the same for every student.">
          <TimePicker
            minuteStep={15}
            value={timeToParts(v.dueTime, { hour: 23, minute: 59 })}
            onChange={(parts) => set("dueTime", partsToTime(parts))}
          />
        </FormField>

        <FormField
          label="Linked session"
          description="Optional — associate this assignment with a session on the calendar."
          error={errors.session}
        >
          <Combobox
            accessibilityLabel="Linked session"
            options={sessionOptions}
            value={v.sessionId === null ? null : String(v.sessionId)}
            onChange={(id) => set("sessionId", id === null ? null : Number(id))}
            placeholder="No session"
            emptyMessage="No sessions for this season."
          />
        </FormField>

        {/* R25: a forum assignment never acquires file settings through the UI. */}
        {!isForum ? <FileSubmissionsSection v={v} set={set} errors={errors} /> : null}
      </View>
    </FormScreen>
  );
}
