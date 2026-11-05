import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { reportOutcome } from "../../lib/outcome";

type SaveInput = { text: string; submit?: boolean };

/** The editor as it stands now. `text` is null until the student types. */
export type DraftState = { text: string | null; serverText: string; editable: boolean };

const FLUSH_FAILED = "Your draft wasn't saved. Check your connection.";

/**
 * The response is only local state, so an edge swipe, the pinned Back or the OS
 * killing the app in the background would lose an essay typed on a phone. Like
 * the quiz (use-quiz-answers.ts), it is written out on leaving and on backgrounding:
 * only if the text differs from what the server has and from what was last sent,
 * isn't blank, can still be edited, and hasn't been handed in. Beyond v1, which
 * lost it. A failed flush is a toast, since the screen may be gone.
 *
 * `send` is every write the editor makes: they run one after another, so a slow
 * save can't land after a newer one and put older text back on the server.
 */
export function useDraftFlush(
  save: (input: SaveInput) => Promise<unknown>,
  draft: DraftState | null,
): (input: SaveInput) => Promise<unknown> {
  const sent = useRef<string | null>(null);
  const handedIn = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const send = (input: SaveInput) => {
    sent.current = input.text;
    if (input.submit) handedIn.current = true;
    const run = chain.current.then(() => save(input));
    chain.current = run.catch(() => undefined);
    return run.catch((err: unknown) => {
      // Nothing landed: the next chance to flush must try this text again.
      if (sent.current === input.text) sent.current = null;
      if (input.submit) handedIn.current = false;
      throw err;
    });
  };

  const flush = () => {
    if (draft === null || !draft.editable || handedIn.current) return;
    const { text, serverText } = draft;
    if (text === null || text.trim() === "" || text === serverText || text === sent.current) return;
    send({ text }).catch(() => reportOutcome("error", FLUSH_FAILED));
  };
  // The unmount and AppState handlers outlive the render that made them.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") flushRef.current();
    });
    return () => {
      sub.remove();
      flushRef.current();
    };
  }, []);

  return send;
}
