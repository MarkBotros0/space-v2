/**
 * Write a note about a student, from a sheet. Note bodies are plain text on
 * the wire (spec 09 D1, C11). The visibility description is v2's: v1's "in
 * addition to you and admins" was wrong (spec 09 D3).
 * The sheet's fields live here, so the parent keeps it mounted: dismissing
 * keeps what was typed, and only a saved note clears it.
 */
import type { NoteVisibility } from "@space/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useCreateNote } from "../../hooks/use-notes";
import { apiErrorMessage } from "../../lib/api-error";
import { haptic } from "../motion";
import { SegmentedControl } from "../ui/segmented-control";
import { Sheet, SheetSaveBar } from "../ui/sheet";
import { Switch } from "../ui/switch";
import { Text } from "../ui/text";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toaster";

const VISIBILITY_OPTIONS: { value: NoteVisibility; label: string }[] = [
  { value: "LEADERS", label: "Leaders" },
  { value: "MENTORS", label: "Mentors" },
  { value: "ADMINS", label: "Admins only" },
];
const NOTE_BODY_MIN = 2;

export function NoteSheet({
  open,
  onClose,
  studentUserId,
  defaultVisibility = "LEADERS",
}: {
  open: boolean;
  onClose: () => void;
  studentUserId: number;
  defaultVisibility?: NoteVisibility;
}) {
  const create = useCreateNote(studentUserId);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>(defaultVisibility);
  const [followUp, setFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failure belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

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
          setVisibility(defaultVisibility);
          setFollowUp(false);
          haptic("light");
          toast.success("Note added.");
          onClose();
        },
        onError: (err) =>
          setError(apiErrorMessage(err, "Couldn't save that note. Check your connection and try again.")),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Write a note"
      footer={<SheetSaveBar label="Add note" onPress={submit} loading={create.isPending} />}
    >
      <View className="flex-col gap-4 pb-4">
        <Textarea
          accessibilityLabel="Note"
          placeholder="Reflections, prayer requests, follow-up items…"
          value={body}
          onChangeText={setBody}
          className="min-h-32"
        />
        <View className="flex-col gap-2">
          <Text variant="subhead" className="font-medium text-foreground">
            Visible to
          </Text>
          <SegmentedControl
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={(v) => setVisibility(v as NoteVisibility)}
          />
          <Text variant="caption" className="text-muted-foreground">
            Only the group you choose can read this note, plus you and SUPER users. Season admins do not
            automatically see leader or mentor notes.
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Text variant="body" className="min-w-0 flex-1" onPress={() => setFollowUp((f) => !f)}>
            Flag for admin follow-up
          </Text>
          <Switch checked={followUp} onCheckedChange={setFollowUp} accessibilityLabel="Flag for admin follow-up" />
        </View>
        {error ? (
          <Text variant="subhead" className="rounded-control bg-bad-soft px-3 py-2 text-bad">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
