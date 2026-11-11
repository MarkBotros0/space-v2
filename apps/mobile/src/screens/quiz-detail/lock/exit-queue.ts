/**
 * The exits the phone saw and hasn't reported yet, kept in secure storage so a kill, a crash or no
 * signal loses none of them. One queue per attempt; the server stores each event id once, so a
 * resend is harmless. secure-store keys allow only letters, digits, `.`, `-` and `_`: hence
 * `quiz-exit-queue.{attemptId}`, not a colon.
 */
import * as SecureStore from "expo-secure-store";
import type { QuizAttemptEventInput } from "@space/shared";

import { isAttemptClosed, type ExitReport } from "./exit-model";

/** The server takes 1..20 events a report. */
const BATCH = 20;
const CURRENT_KEY = "quiz-exit-current";
const queueKey = (id: number) => `quiz-exit-queue.${id}`;
const leftKey = (id: number) => `quiz-exit-left.${id}`;
const openKey = (id: number) => `quiz-open.${id}`;

// Storage that fails (a locked keychain) reads as empty and drops the write: the quiz goes on.
async function read(key: string): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(key)) ?? null;
  } catch {
    return null;
  }
}
async function write(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value).catch(() => undefined);
}
async function remove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

/** One read-modify-write at a time per key: an exit and a screenshot landing together both stay. */
const chains = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
  chains.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

function parse(raw: string | null): QuizAttemptEventInput[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as QuizAttemptEventInput[]) : [];
  } catch {
    return [];
  }
}

export class ExitQueue {
  constructor(private readonly attemptId: number) {}

  private get key() {
    return queueKey(this.attemptId);
  }

  peek(): Promise<QuizAttemptEventInput[]> {
    return serial(this.key, async () => parse(await read(this.key)));
  }

  enqueue(event: QuizAttemptEventInput): Promise<void> {
    return serial(this.key, async () => {
      const queue = parse(await read(this.key));
      if (queue.some((e) => e.clientEventId === event.clientEventId)) return;
      await write(this.key, JSON.stringify([...queue, event]));
    });
  }

  /**
   * Report everything queued, a batch at a time; each batch leaves the queue only once the server
   * took it, and events queued meanwhile stay for the next batch. A failed send throws with the
   * queue as it was. Stops once the attempt is closed: nothing after that counts. Null: nothing to send.
   */
  async drain(send: (events: QuizAttemptEventInput[]) => Promise<ExitReport>): Promise<ExitReport | null> {
    const sent = new Set<string>();
    let last: ExitReport | null = null;
    for (;;) {
      const batch = (await this.peek()).filter((e) => !sent.has(e.clientEventId)).slice(0, BATCH);
      if (batch.length === 0) return last;
      last = await send(batch);
      for (const e of batch) sent.add(e.clientEventId);
      await serial(this.key, async () => {
        const rest = parse(await read(this.key)).filter((e) => !sent.has(e.clientEventId));
        await (rest.length > 0 ? write(this.key, JSON.stringify(rest)) : remove(this.key));
      });
      if (isAttemptClosed(last)) return last;
    }
  }

  /** The student left (server time): kept until they come back, so a kill in the background still counts. */
  setLeft(leftAt: string): Promise<void> {
    const key = leftKey(this.attemptId);
    return serial(key, () => write(key, leftAt));
  }

  /** The leave not yet matched by a return, removed as it is read: two takes at once, one gets it. */
  takeLeft(): Promise<string | null> {
    const key = leftKey(this.attemptId);
    return serial(key, async () => {
      const leftAt = await read(key);
      if (leftAt !== null) await remove(key);
      return leftAt;
    });
  }

  /** The attempt is on screen: a later cold start with this still set is a relaunch. */
  markOpen(): Promise<void> {
    return write(openKey(this.attemptId), "1");
  }

  async wasOpen(): Promise<boolean> {
    return (await read(openKey(this.attemptId))) !== null;
  }
}

/** Everything kept for this attempt, gone: it is no longer the open one. */
export async function forgetAttempt(attemptId: number): Promise<void> {
  await serial(queueKey(attemptId), () => remove(queueKey(attemptId)));
  await serial(leftKey(attemptId), () => remove(leftKey(attemptId)));
  await remove(openKey(attemptId));
  if ((await read(CURRENT_KEY)) === String(attemptId)) await remove(CURRENT_KEY);
}

/** This attempt is the open one; whatever an earlier attempt left behind is cleared. */
export async function claimAttempt(attemptId: number): Promise<void> {
  const current = await read(CURRENT_KEY);
  if (current !== null && current !== String(attemptId)) await forgetAttempt(Number(current));
  await write(CURRENT_KEY, String(attemptId));
}
