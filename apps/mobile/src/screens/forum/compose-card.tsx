import { useState } from "react";
import { View } from "react-native";
import { countWords, plainTextToHtml, type ForumView } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, RichTextView, Text, Textarea } from "../../design/ui";
import { useSubmitForumResponse } from "../../hooks/use-forum";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate } from "../../lib/format";

import { NOTICE } from "./shared";

/**
 * v1 forum-view.tsx compose card. Plain text in and out: the server converts
 * to and from stored HTML, so a rich editor here would store literal tags
 * (gap note). The leader's feedback on the own post is v2's (spec 14 D9).
 */
export function ComposeCard({ assignmentId, view }: { assignmentId: number; view: ForumView }) {
  const own = view.own;
  const submit = useSubmitForumResponse(assignmentId);
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
      {own.feedback ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leader feedback</CardTitle>
          </CardHeader>
          <CardContent className="flex-col gap-1">
            <RichTextView html={plainTextToHtml(own.feedback)} />
            {own.reviewedAt ? (
              <Text className="text-xs text-muted-foreground">{formatDate(own.reviewedAt)}</Text>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
