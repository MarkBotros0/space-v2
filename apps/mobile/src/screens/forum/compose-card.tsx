import { useState } from "react";
import { View } from "react-native";
import { countWords, type ForumView } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Text, Textarea } from "../../design/ui";
import { useSubmitForumResponse } from "../../hooks/use-forum";
import { apiErrorMessage } from "../../lib/api-error";

import { NOTICE } from "./shared";

/**
 * v1 forum-view.tsx compose card. Plain text in and out: the server converts
 * to and from stored HTML, so a rich editor here would store literal tags
 * (gap note). A forum post has no review (owner): posting is what makes the
 * part done.
 */
export function ComposeCard({ assignmentId, partId, view }: { assignmentId: number; partId: number; view: ForumView }) {
  const own = view.own;
  const submit = useSubmitForumResponse(assignmentId, partId);
  const [draft, setDraft] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (own === null) return null;

  const value = draft ?? own.text;
  const words = countWords(value);
  const minWords = view.minWords ?? 0;
  // Math.max(1, ...): an empty post must never unlock the feed (D-14.5).
  const tooShort = words < Math.max(1, minWords);
  const meetsMin = !tooShort;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Your response</CardTitle>
          {own.posted ? <Badge variant="success">Posted</Badge> : null}
        </CardHeader>
        <CardContent className="flex-col gap-3">
          <Textarea
            accessibilityLabel="Your response"
            placeholder="Share your thoughts…"
            value={value}
            onChangeText={setDraft}
            className="min-h-32"
          />
          <Text
            className={cn("text-xs", meetsMin ? "text-success-700 dark:text-success-300" : "text-muted-foreground")}
          >
            {`${words} ${words === 1 ? "word" : "words"}${minWords > 0 ? ` · minimum ${minWords}` : ""}`}
          </Text>
          {submit.isError ? (
            <Text className={NOTICE.error}>
              {apiErrorMessage(submit.error, "Couldn't post your response. Try again.")}
            </Text>
          ) : null}
          {info && !submit.isPending ? <Text className={NOTICE.success}>{info}</Text> : null}
          <View className="flex-row justify-end">
            <Button
              disabled={submit.isPending || tooShort}
              onPress={() => {
                if (tooShort) return;
                const wasPosted = own.posted;
                setInfo(null);
                submit.mutate(value, { onSuccess: () => setInfo(wasPosted ? "Response updated." : "Posted!") });
              }}
            >
              {submit.isPending ? "Posting…" : own.posted ? "Update response" : "Post response"}
            </Button>
          </View>
        </CardContent>
      </Card>
    </>
  );
}
