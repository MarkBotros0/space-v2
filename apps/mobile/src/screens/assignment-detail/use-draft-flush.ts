import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { reportOutcome } from "../../lib/outcome";
import { apiErrorStatus } from "../../lib/api-error";

type SaveInput = { text: string; submit?: boolean };

/** The editor as it stands now. `text` is null until the student types. */
type DraftState = { text: string | null; serverText: string; editable: boolean };

const FLUSH_FAILED = "Your draft wasn't saved. Check your connection.";
const FLUSH_REFUSED = "Your draft wasn't saved.";
const FLUSH_LOCKED = "Your draft wasn't saved. This assignment can't be edited any more.";

/**
 * Why a flush failed. A reply from the server (any status) means the network was fine, so
 * "Check your connection" would be wrong: 409 is the assignment having closed to edits.
 */
function flushFailedMessage(err: unknown): string {
  const status = apiErrorStatus(err);
  if (status === undefined) return FLUSH_FAILED;
  return status === 409 ? FLUSH_LOCKED : FLUSH_REFUSED;
}

/**
 * The last write of each submission. It lives outside the screen: leaving flushes, and
 * coming straight back mounts a new editor whose save must still wait for that flush.
 */
const lastWrite = new Map<string, Promise<unknown>>();

/**
 * The response is only local state, so an edge swipe, the pinned Back or the OS
 * killing the app in the background would lose an essay typed on a phone. Like
 * the quiz (use-quiz-answers.ts), it is written out on leaving and on backgrounding:
 * only if the text differs from what the server has and from what was last sent,
 * isn't blank, can still be edited, and hasn't been handed in. Beyond v1, which
 * lost it. A failed flush is a toast, since the screen may be gone.
 *
 * `send` is every write the editor makes: they run one after another, across
 * re-opening the screen too, so a slow save can't land after a newer one and put older
 * text back on the server.
 */
export function useDraftFlush(
  publicId: string,
  save: (input: SaveInput) => Promise<unknown>,
  draft: DraftState | null,
): (input: SaveInput) => Promise<unknown> {
  const sent = useRef<string | null>(null);
  const handedIn = useRef(false);
  // Returned work is editable again: the submit that locked it is over, so it no longer
  // blocks a flush, and its text is no longer "what was last sent".
  const wasEditable = useRef(draft?.editable ?? false);

  const editable = draft?.editable ?? false;
  useEffect(() => {
    if (editable && !wasEditable.current && handedIn.current) {
      handedIn.current = false;
      sent.current = null;
    }
    wasEditable.current = editable;
  }, [editable]);

  const send = (input: SaveInput) => {
    sent.current = input.text;
    if (input.submit) handedIn.current = true;
    const run = (lastWrite.get(publicId) ?? Promise.resolve()).then(() => save(input));
    const settled = run
      .catch(() => undefined)
      .then(() => {
        if (lastWrite.get(publicId) === settled) lastWrite.delete(publicId);
      });
    lastWrite.set(publicId, settled);
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
    send({ text }).catch((err: unknown) => reportOutcome("error", flushFailedMessage(err)));
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
