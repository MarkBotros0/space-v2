/**
 * Adding or editing one timed question (owner, 2026-11-13: "make the timestamp bar with a scroller…
 * and make the video move with it as a helper"). With the video known, the moment is picked on a time
 * bar under the video itself, which follows the bar; "Use the video's time" takes where the author
 * paused it. Without it (a session whose video isn't known here) the time is typed. Each option
 * carries its own Correct mark, and an option beyond two can be removed.
 */
import { formatTimestamp, parseTimestamp } from "@space/shared";
import { Check, Trash2 } from "lucide-react-native";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Pressable } from "../../design/ui/pressable";

import { FormErrorBox } from "../../design/forms/form-parts";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { directionStyle } from "../../design/lib/text-direction";
import { Button } from "../../design/ui/button";
import { Card } from "../../design/ui/card";
import { FormField } from "../../design/ui/form-field";
import { Input } from "../../design/ui/input";
import { Text } from "../../design/ui/text";
import { TimeScrubber } from "../../design/ui/time-scrubber";
import type { VideoQuestionFormState } from "../../lib/video-question-form";
import { VideoPreview, type VideoPreviewHandle } from "../assignment-form/video-preview";

iconWithClassName(Check, Trash2);

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;
/** At most this often while dragging, so the player isn't flooded with seeks. */
const SEEK_EVERY_MS = 250;

/** The video the questions sit on, when the editor knows it. */
export type QuestionVideo = { videoId: string; durationSeconds: number | null };

function CorrectMark({ n, checked, onPress }: { n: number; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`Option ${n} is the correct answer`}
      accessibilityState={{ selected: checked, checked }}
      onPress={onPress}
      className="size-11 shrink-0 items-center justify-center"
    >
      <View
        className={cn(
          "size-6 items-center justify-center rounded-full border",
          checked ? "border-ok bg-ok" : "border-control-border",
        )}
      >
        {checked ? <Check size={14} className="text-primary-foreground" /> : null}
      </View>
    </Pressable>
  );
}

/** The moment: a time bar under the video when it is known, else a typed time. */
function MomentPicker({
  video,
  form,
  error,
  onTimestamp,
}: {
  video: QuestionVideo | undefined;
  form: VideoQuestionFormState;
  error: string | undefined;
  onTimestamp: (timestamp: string) => void;
}) {
  const player = useRef<VideoPreviewHandle>(null);
  const lastSeek = useRef(0);
  const [length, setLength] = useState<number | null>(video?.durationSeconds ?? null);
  if (video === undefined) {
    return (
      <FormField label="When it shows" error={error} description="The time in the video, like 2:30.">
        <Input
          accessibilityLabel="When it shows"
          value={form.timestamp}
          onChangeText={onTimestamp}
          placeholder="2:30"
          autoCapitalize="none"
        />
      </FormField>
    );
  }
  const seconds = parseTimestamp(form.timestamp) ?? 0;
  const set = (s: number, settled: boolean) => {
    onTimestamp(formatTimestamp(s));
    const now = Date.now();
    if (settled || now - lastSeek.current >= SEEK_EVERY_MS) {
      lastSeek.current = now;
      player.current?.seekTo(s, settled);
    }
  };
  return (
    <View className="flex-col gap-3">
      <VideoPreview videoId={video.videoId} handle={player} onDuration={setLength} />
      {length === null ? (
        <Text variant="caption" className="text-muted-foreground">
          Loading the video…
        </Text>
      ) : (
        <TimeScrubber
          label="When it shows"
          value={seconds}
          max={length}
          format={formatTimestamp}
          onChange={(s) => set(s, false)}
          onRelease={(s) => set(s, true)}
        />
      )}
      <Button
        variant="plain"
        size="sm"
        className="self-start"
        onPress={() => void player.current?.currentTime().then((t) => onTimestamp(formatTimestamp(Math.floor(t))))}
      >
        Use the video's time
      </Button>
      {error ? (
        <Text variant="caption" className="text-bad">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function VideoQuestionFormCard({
  form,
  video,
  timestampError,
  formError,
  saving,
  onPatch,
  onSave,
  onCancel,
}: {
  form: VideoQuestionFormState;
  video: QuestionVideo | undefined;
  timestampError: string | undefined;
  formError: string | null;
  saving: boolean;
  onPatch: (changes: Partial<VideoQuestionFormState>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const removeOption = (index: number) =>
    onPatch({
      options: form.options.filter((_, i) => i !== index),
      // The mark stays on the same option, or moves to the first when its option goes.
      correctIndex:
        index === form.correctIndex ? 0 : form.correctIndex > index ? form.correctIndex - 1 : form.correctIndex,
    });
  return (
    <Card className="flex-col gap-4 p-4">
      <Text variant="headline">{form.editingId === null ? "New question" : "Edit question"}</Text>
      <MomentPicker video={video} form={form} error={timestampError} onTimestamp={(t) => onPatch({ timestamp: t })} />
      <FormField label="Question">
        <Input
          accessibilityLabel="Question"
          value={form.prompt}
          onChangeText={(v) => onPatch({ prompt: v })}
          style={directionStyle(form.prompt)}
        />
      </FormField>
      <View className="flex-col gap-2">
        <Text variant="subhead" className="font-semibold">
          Answers
        </Text>
        <Text variant="caption" className="text-muted-foreground">
          Tap the circle beside the correct one.
        </Text>
        {form.options.map((option, index) => (
          <View key={index} className="flex-row items-center gap-1">
            <CorrectMark
              n={index + 1}
              checked={form.correctIndex === index}
              onPress={() => onPatch({ correctIndex: index })}
            />
            <View className="min-w-0 flex-1">
              <Input
                accessibilityLabel={`Option ${index + 1}`}
                placeholder={`Option ${index + 1}`}
                value={option}
                onChangeText={(v) => onPatch({ options: form.options.map((o, i) => (i === index ? v : o)) })}
                style={directionStyle(option)}
              />
            </View>
            {form.options.length > MIN_OPTIONS ? (
              <Button
                variant="plain"
                size="icon"
                accessibilityLabel={`Remove option ${index + 1}`}
                onPress={() => removeOption(index)}
              >
                <Trash2 size={18} className="text-muted-foreground" />
              </Button>
            ) : null}
          </View>
        ))}
        {form.options.length < MAX_OPTIONS ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onPress={() => onPatch({ options: [...form.options, ""] })}
          >
            Add an answer
          </Button>
        ) : null}
      </View>
      <FormField label="Points">
        <Input
          accessibilityLabel="Points"
          value={form.points}
          onChangeText={(v) => onPatch({ points: v })}
          keyboardType="number-pad"
        />
      </FormField>
      <FormErrorBox message={formError} />
      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" disabled={saving} loading={saving} onPress={onSave}>
          {form.editingId === null ? "Add question" : "Save question"}
        </Button>
      </View>
    </Card>
  );
}
