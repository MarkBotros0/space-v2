/**
 * A video part's editor: the YouTube link (checked as it is typed, with the
 * player once it parses), the title (YouTube's until the author changes it),
 * skip blocking, and the timed questions, which hang off a saved part and so
 * wait until the assignment is saved.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { formatTimestamp, parseYouTubeId } from "@space/shared";

import { FormField } from "../../../design/ui/form-field";
import { Input } from "../../../design/ui/input";
import { Sheet, SheetSaveBar } from "../../../design/ui/sheet";
import { Text } from "../../../design/ui/text";
import { useYoutubeTitle } from "../../../hooks/use-youtube-meta";
import type { QuestionVideo } from "../../video-quiz/video-question-form-card";
import { VideoQuestionsEditor } from "../../video-quiz/video-questions-editor";
import { SwitchRow } from "../switch-row";
import { VideoPreview } from "../video-preview";
import type { PartSheetProps, VideoDraft } from "./part-fields";

const NOT_A_LINK = "That isn't a YouTube link";

function TimedQuestions({
  assignmentId,
  partId,
  video,
  onFormOpenChange,
}: {
  assignmentId: number | null;
  partId: number | undefined;
  video: QuestionVideo | undefined;
  onFormOpenChange: (open: boolean) => void;
}) {
  if (assignmentId !== null && partId !== undefined) {
    return (
      <VideoQuestionsEditor
        owner={{ kind: "part", assignmentId, partId }}
        video={video}
        onFormOpenChange={onFormOpenChange}
      />
    );
  }
  return (
    <View className="flex-col gap-1">
      <Text variant="headline" className="text-foreground">
        Video questions
      </Text>
      <Text variant="subhead" className="text-muted-foreground">
        Save the assignment first, then add timed questions to this video.
      </Text>
    </View>
  );
}

export function VideoPartSheet({
  open,
  onClose,
  initial,
  onSave,
  assignmentId,
}: PartSheetProps<VideoDraft> & { assignmentId: number | null }) {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  // A new part takes YouTube's title until the author types one.
  const [autoTitle, setAutoTitle] = useState(true);
  const [blockSkipping, setBlockSkipping] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // While a question is open its own player shows the video; this one steps aside (one player at a time).
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLink(initial?.youtubeUrl ?? "");
    setTitle(initial?.title ?? "");
    setAutoTitle(initial === null);
    setBlockSkipping(initial?.blockSkipping ?? false);
    setDuration(initial?.durationSeconds ?? null);
    setErrors({});
    setAsking(false);
  }, [open, initial]);

  const videoId = parseYouTubeId(link);
  const youtubeTitle = useYoutubeTitle(videoId);
  useEffect(() => {
    if (youtubeTitle !== null && autoTitle) setTitle(youtubeTitle);
  }, [youtubeTitle, autoTitle]);

  const changeLink = (next: string) => {
    // Another video has another length: wait for its player to say.
    if (parseYouTubeId(next) !== videoId) setDuration(null);
    setLink(next);
    setErrors(({ youtubeUrl: _gone, ...rest }) => rest);
  };

  const save = () => {
    const next: Record<string, string> = {};
    const name = title.trim() === "" ? (youtubeTitle ?? "") : title.trim();
    if (link.trim() === "") next.youtubeUrl = "Paste a YouTube link";
    else if (videoId === null) next.youtubeUrl = NOT_A_LINK;
    else if (duration === null) next.form = "The video's length isn't known yet. Wait for it to load, then save.";
    if (name === "") next.title = "Give the video a title";
    else if (name.length > 200) next.title = "Keep the title to 200 characters";
    setErrors(next);
    if (Object.keys(next).length > 0 || duration === null) return;
    onSave({ kind: "VIDEO", title: name, youtubeUrl: link.trim(), blockSkipping, durationSeconds: duration });
    onClose();
  };

  const linkError = link.trim() !== "" && videoId === null ? NOT_A_LINK : errors.youtubeUrl;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial === null ? "Add a video" : "Edit video"}
      footer={
        <SheetSaveBar
          label={initial === null ? "Add video" : "Save video"}
          onPress={save}
          error={errors.form ?? null}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <FormField label="YouTube link" required error={linkError}>
          <Input
            accessibilityLabel="YouTube link"
            value={link}
            onChangeText={changeLink}
            placeholder="https://youtu.be/…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </FormField>
        {videoId !== null && !asking ? (
          <View className="flex-col gap-1">
            {/* A new video on a ready player never fires onReady again (react-native-youtube-iframe 2.4.1): remount it per video. */}
            <VideoPreview key={videoId} videoId={videoId} onDuration={setDuration} />
            <Text variant="caption" className="text-muted-foreground">
              {duration === null ? "Loading the video's length…" : `Length ${formatTimestamp(duration)}`}
            </Text>
          </View>
        ) : null}
        <FormField label="Title" required error={errors.title} description="YouTube's title until you change it.">
          <Input
            accessibilityLabel="Title"
            value={title}
            onChangeText={(t) => {
              setAutoTitle(false);
              setTitle(t);
            }}
          />
        </FormField>
        <SwitchRow
          label="Don't let students skip ahead"
          description="They can go back, but not past what they've watched."
          checked={blockSkipping}
          onChange={setBlockSkipping}
        />
        <TimedQuestions
          assignmentId={assignmentId}
          partId={initial?.id}
          // The saved link: questions hang off the saved part, so they sit on its video.
          video={
            initial !== null && parseYouTubeId(initial.youtubeUrl) !== null
              ? { videoId: parseYouTubeId(initial.youtubeUrl)!, durationSeconds: initial.durationSeconds ?? null }
              : undefined
          }
          onFormOpenChange={setAsking}
        />
      </View>
    </Sheet>
  );
}
