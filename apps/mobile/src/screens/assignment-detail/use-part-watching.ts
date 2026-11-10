/**
 * Counts what actually played on a video part and reports it (spec "Watched").
 * The player's poll hands each playhead in: while the video is meant to be
 * playing, the stretch since the last playhead is a watched range, unless the
 * playhead went back or jumped (a seek), which starts a new range instead. The
 * ranges go to the server at most every 10 s while playing, and on pause, on
 * backgrounding and on leaving; the server merges them and clamps them to
 * wall-clock time, so this count is the student's live view, not the record.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { mergeIntervals, watchedSeconds } from "@space/shared";

import { useSavePartVideoProgress } from "../../hooks/use-video-quiz";

type Range = [number, number];

/** The backend credits a first report with at most 15 s, so reports go out well inside that. */
const REPORT_MS = 10_000;

/** A playhead step longer than this between two polls (400 ms apart) is a seek, not playback. */
const JUMP_SECONDS = 2.5;

export function usePartWatching({
  assignmentId,
  partId,
  initialRanges,
  playing,
  record,
}: {
  assignmentId: number;
  partId: number;
  /** What the server already counts. */
  initialRanges: Range[];
  playing: boolean;
  /** False in a finished season: the video plays, nothing is reported (the server would refuse it). */
  record: boolean;
}) {
  const { report } = useSavePartVideoProgress(assignmentId, partId);
  const watchedRef = useRef<Range[]>(mergeIntervals(initialRanges, []));
  const unsentRef = useRef<Range[]>([]);
  const lastRef = useRef<number | null>(null);
  const positionRef = useRef(0);
  const [watched, setWatched] = useState(() => watchedSeconds(watchedRef.current));

  const onPoll = useCallback((seconds: number, isPlaying: boolean): void => {
    positionRef.current = seconds;
    const last = lastRef.current;
    lastRef.current = isPlaying ? seconds : null;
    if (!isPlaying || last === null || seconds <= last || seconds - last > JUMP_SECONDS) return;
    const range: Range = [last, seconds];
    unsentRef.current = mergeIntervals(unsentRef.current, [range]);
    watchedRef.current = mergeIntervals(watchedRef.current, [range]);
    setWatched(watchedSeconds(watchedRef.current));
  }, []);

  const send = useCallback((): void => {
    const ranges = unsentRef.current;
    if (!record || ranges.length === 0) return;
    unsentRef.current = [];
    // Never throws: a failed report keeps its ranges for the next one.
    void report(ranges, Math.floor(positionRef.current));
  }, [record, report]);
  // The interval, AppState and unmount handlers outlive the render that made them.
  const sendRef = useRef(send);
  sendRef.current = send;

  /** Playback stopped (pause, end, a question): the range closes and goes out. */
  const onStop = useCallback((): void => {
    lastRef.current = null;
    sendRef.current();
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => sendRef.current(), REPORT_MS);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") sendRef.current();
    });
    return () => {
      sub.remove();
      sendRef.current();
    };
  }, []);

  return { watchedSeconds: watched, onPoll, onStop };
}
