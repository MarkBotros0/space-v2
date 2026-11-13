/**
 * The forum part's editor: the prompt, the minimum words to post, whether
 * students post before reading their group's posts, and peer comments
 * (today's forum settings).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";

import { FormField } from "../../../design/ui/form-field";
import { Input } from "../../../design/ui/input";
import { Sheet, SheetSaveBar } from "../../../design/ui/sheet";
import { Textarea } from "../../../design/ui/textarea";
import { SwitchRow } from "../switch-row";
import { numberText, wholeNumberIn, type ForumDraft, type PartSheetProps } from "./part-fields";

/** v1's forum default (R21). */
const DEFAULT_MIN_WORDS = "50";

export function ForumPartSheet({ open, onClose, initial, onSave }: PartSheetProps<ForumDraft>) {
  const [prompt, setPrompt] = useState("");
  const [minWords, setMinWords] = useState(DEFAULT_MIN_WORDS);
  const [postToRead, setPostToRead] = useState(false);
  const [allowComments, setAllowComments] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setPrompt(initial?.prompt ?? "");
    setMinWords(initial === null ? DEFAULT_MIN_WORDS : numberText(initial.minWords));
    // Off for a new forum (owner, 2026-11-13).
    setPostToRead(initial?.postToRead ?? false);
    setAllowComments(initial?.allowComments ?? false);
    setErrors({});
  }, [open, initial]);

  const save = () => {
    const next: Record<string, string> = {};
    const min = wholeNumberIn(minWords, 1, 5000);
    if (prompt.trim() === "") next.prompt = "Write the prompt";
    if (min.error) next.minWords = min.error;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({ kind: "FORUM", prompt: prompt.trim(), minWords: min.value ?? null, postToRead, allowComments });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial === null ? "Add a forum" : "Edit forum"}
      footer={<SheetSaveBar label={initial === null ? "Add forum" : "Save forum"} onPress={save} />}
    >
      <View className="flex-col gap-4 pb-4">
        <FormField label="Prompt" required error={errors.prompt}>
          <Textarea accessibilityLabel="Prompt" value={prompt} onChangeText={setPrompt} />
        </FormField>
        <FormField
          label="Minimum words"
          description="Students write at least this many words to post."
          error={errors.minWords}
        >
          <Input
            accessibilityLabel="Minimum words"
            value={minWords}
            onChangeText={setMinWords}
            keyboardType="number-pad"
            placeholder="None"
          />
        </FormField>
        <SwitchRow
          label="Post before reading others"
          description="Students see their group's posts only after posting their own."
          checked={postToRead}
          onChange={setPostToRead}
        />
        <SwitchRow
          label="Allow peer comments"
          description="Students can comment on each other's posts."
          checked={allowComments}
          onChange={setAllowComments}
        />
      </View>
    </Sheet>
  );
}
