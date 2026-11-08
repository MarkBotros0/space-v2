import { Fragment } from "react";
import { Linking } from "react-native";

import { Text } from "../../design/ui";

export type LinkRun = { kind: "text"; value: string } | { kind: "link"; url: string };

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;
const TRAILING = /[.,)]+$/;

/**
 * Splits plain text into text and link runs. Only `http(s)://` URLs are links
 * (never `javascript:` or any other scheme), and trailing `.`, `,` and `)` stay
 * in the text, so "see https://x.test." links `https://x.test`.
 */
export function linkify(text: string): LinkRun[] {
  const runs: LinkRun[] = [];
  let last = 0;
  const push = (value: string) => {
    if (value) runs.push({ kind: "text", value });
  };
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING, "");
    // "https://" alone (everything trimmed away) is not a link.
    if (!/^https?:\/\/[^\s.,)]/i.test(url)) continue;
    push(text.slice(last, start));
    runs.push({ kind: "link", url });
    last = start + url.length;
  }
  push(text.slice(last));
  return runs;
}

/** A post body: plain text with its links tappable, in the primary colour and never underlined. */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <Text variant="body">
      {linkify(text).map((run, i) =>
        run.kind === "text" ? (
          <Fragment key={i}>{run.value}</Fragment>
        ) : (
          <Text
            key={i}
            variant="body"
            accessibilityRole="link"
            className="text-primary"
            onPress={() => void Linking.openURL(run.url)}
          >
            {run.url}
          </Text>
        ),
      )}
    </Text>
  );
}
