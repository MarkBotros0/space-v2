/**
 * Port of v1 components/students/note-form.tsx. Note bodies are plain text on
 * the wire (spec 09 D1, C11), so a Textarea replaces v1's rich-text editor.
 * The visibility description is v2's: v1's "in addition to you and admins"
 * was wrong (spec 09 D3).
 */
import type { NoteVisibility } from "@space/shared";
import { Flag } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { useCreateNote } from "../../hooks/use-notes";
import { apiErrorMessage } from "../../lib/api-error";
import { iconWithClassName } from "../lib/icon";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { FormField } from "../ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Text } from "../ui/text";
import { Textarea } from "../ui/textarea";

iconWithClassName(Flag);

const VISIBILITY: Record<NoteVisibility, string> = { LEADERS: "Leaders", MENTORS: "Mentors", ADMINS: "Admins only" };
const NOTE_BODY_MIN = 2;

export function NoteForm({ studentUserId, defaultVisibility = "LEADERS" }: { studentUserId: number; defaultVisibility?: NoteVisibility }) {
  const create = useCreateNote(studentUserId);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>(defaultVisibility);
  const [followUp, setFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const text = body.trim();
    if (text.length < NOTE_BODY_MIN) {
      setError("Note can't be empty.");
      return;
    }
    create.mutate(
      { body: text, visibility, followUpFlagged: followUp },
      {
        onSuccess: () => {
          setBody("");
          setFollowUp(false);
        },
        onError: (err) => setError(apiErrorMessage(err, "Couldn't save that note. Check your connection and try again.")),
      },
    );
  };

  return (
    <View className="flex-col gap-3">
      <FormField label="Note">
        <Textarea
          accessibilityLabel="Note"
          placeholder="Reflections, prayer requests, follow-up items…"
          value={body}
          onChangeText={setBody}
          className="min-h-32"
        />
      </FormField>
      <View className="flex-col gap-3">
        <FormField
          label="Visible to"
          description="Only the group you choose can read this note, plus you and SUPER users. Season admins do not automatically see leader or mentor notes."
        >
          <Select items={VISIBILITY} value={visibility} onValueChange={(v) => setVisibility(v as NoteVisibility)}>
            <SelectTrigger accessibilityLabel="Visible to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VISIBILITY) as NoteVisibility[]).map((v) => (
                <SelectItem key={v} value={v}>
                  {VISIBILITY[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <View className="flex-row items-center gap-2">
          <Checkbox checked={followUp} onCheckedChange={setFollowUp} accessibilityLabel="Flag for admin follow-up" />
          <Flag size={16} className="text-warning-600" />
          <Text className="text-sm" onPress={() => setFollowUp((f) => !f)}>
            Flag for admin follow-up
          </Text>
        </View>
      </View>
      {error ? (
        <Text className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-800 dark:bg-error-950 dark:text-error-200">{error}</Text>
      ) : null}
      <View className="flex-row justify-end">
        <Button onPress={submit} disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Add note"}
        </Button>
      </View>
    </View>
  );
}
