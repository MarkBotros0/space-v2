/**
 * An essay part's editor: the question, an optional word range (min ≤ max,
 * the shared schema's rule) and file uploads with their size and types.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { assignmentPartInputSchema, type MimeCategory } from "@space/shared";

import { FieldCell, FieldRow } from "../../../design/forms/form-section";
import { FormField } from "../../../design/ui/form-field";
import { Input } from "../../../design/ui/input";
import { MultiSelect } from "../../../design/ui/multi-select";
import { Sheet, SheetSaveBar } from "../../../design/ui/sheet";
import { Textarea } from "../../../design/ui/textarea";
import { MIME_CATEGORY_LABELS } from "../../../lib/assignment-labels";
import { firstErrorByField } from "../../../lib/form-errors";
import { SwitchRow } from "../switch-row";
import { numberText, wholeNumberIn, type EssayDraft, type PartSheetProps } from "./part-fields";

const MIME_OPTIONS = (Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((c) => ({
  value: c,
  label: MIME_CATEGORY_LABELS[c],
}));
/** v1's file-size default once uploads are on (R10). */
const DEFAULT_FILE_MB = "10";

export function EssayPartSheet({ open, onClose, initial, onSave }: PartSheetProps<EssayDraft>) {
  const [prompt, setPrompt] = useState("");
  const [minWords, setMinWords] = useState("");
  const [maxWords, setMaxWords] = useState("");
  const [files, setFiles] = useState(false);
  const [fileMb, setFileMb] = useState(DEFAULT_FILE_MB);
  const [types, setTypes] = useState<MimeCategory[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setPrompt(initial?.prompt ?? "");
    setMinWords(numberText(initial?.minWords));
    setMaxWords(numberText(initial?.maxWords));
    setFiles(initial?.maxFileSizeMb != null);
    setFileMb(initial?.maxFileSizeMb != null ? String(initial.maxFileSizeMb) : DEFAULT_FILE_MB);
    setTypes(initial?.allowedMimeCategories ?? []);
    setErrors({});
  }, [open, initial]);

  const save = () => {
    const next: Record<string, string> = {};
    const min = wholeNumberIn(minWords, 1, 5000);
    const max = wholeNumberIn(maxWords, 1, 5000);
    const size = files ? wholeNumberIn(fileMb, 1, 100) : { value: null };
    if (prompt.trim() === "") next.prompt = "Write the question";
    if (min.error) next.minWords = min.error;
    if (max.error) next.maxWords = max.error;
    if (size.error) next.maxFileSizeMb = size.error;
    else if (files && size.value === null) next.maxFileSizeMb = "Enter the largest file size";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    const part = {
      kind: "ESSAY" as const,
      prompt: prompt.trim(),
      minWords: min.value ?? null,
      maxWords: max.value ?? null,
      maxFileSizeMb: files ? (size.value ?? null) : null,
      allowedMimeCategories: files ? types : [],
    };
    // The range rule is the server's own (min ≤ max).
    const parsed = assignmentPartInputSchema.safeParse(part);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    onSave(part);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial === null ? "Add an essay question" : "Edit essay question"}
      footer={<SheetSaveBar label={initial === null ? "Add question" : "Save question"} onPress={save} />}
    >
      <View className="flex-col gap-4 pb-4">
        <FormField label="Question" required error={errors.prompt}>
          <Textarea accessibilityLabel="Question" value={prompt} onChangeText={setPrompt} />
        </FormField>
        <FieldRow>
          <FieldCell>
            <FormField label="Minimum words" error={errors.minWords}>
              <Input
                accessibilityLabel="Minimum words"
                value={minWords}
                onChangeText={setMinWords}
                keyboardType="number-pad"
                placeholder="None"
              />
            </FormField>
          </FieldCell>
          <FieldCell>
            <FormField label="Maximum words" error={errors.maxWords}>
              <Input
                accessibilityLabel="Maximum words"
                value={maxWords}
                onChangeText={setMaxWords}
                keyboardType="number-pad"
                placeholder="None"
              />
            </FormField>
          </FieldCell>
        </FieldRow>
        <SwitchRow
          label="Allow file uploads"
          description="Students can attach files to their answer."
          checked={files}
          onChange={setFiles}
        />
        {files ? (
          <>
            <FormField label="Max file size (MB)" error={errors.maxFileSizeMb}>
              <Input
                accessibilityLabel="Max file size (MB)"
                value={fileMb}
                onChangeText={setFileMb}
                keyboardType="number-pad"
              />
            </FormField>
            <FormField label="Allowed types">
              <MultiSelect
                accessibilityLabel="Allowed types"
                options={MIME_OPTIONS}
                value={types}
                onChange={(v) => setTypes(v as MimeCategory[])}
                placeholder="Any type"
              />
            </FormField>
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
