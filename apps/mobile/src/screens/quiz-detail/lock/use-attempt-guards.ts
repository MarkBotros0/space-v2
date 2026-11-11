import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef } from "react";
import { AppState, BackHandler, Dimensions, Platform, type AppStateStatus, type ScaledSize } from "react-native";

import { exitTransition, isMultiWindow, trackedState } from "./exit-model";

const AWAKE_TAG = "quiz-attempt";
/** A shrunk window counts once it has stayed shrunk this long (a rotation passes through odd sizes). */
const SPLIT_HOLD_MS = 1000;

/** While `active` the screen doesn't dim or lock by itself. */
export function useKeepAwakeWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(AWAKE_TAG).catch(() => undefined);
    return () => void deactivateKeepAwake(AWAKE_TAG).catch(() => undefined);
  }, [active]);
}

/** While `active` Android's back button does nothing: the quiz is left only by handing it in. */
export function useBackBlock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [active]);
}

interface ExitHandlers {
  /** The student left the quiz, at this phone time. */
  onLeft: (at: number) => void;
  /** They are back on it. */
  onReturned: () => void;
}

/**
 * While `active`: the app going to the background, or (Android) its window shrinking under 85% of
 * the screen for over a second (split screen), is a leave; the app back in front and full size is
 * the return. Both together are one leave. `inactive` alone (a peek at the shade) is neither.
 */
export function useExitWatch(active: boolean, handlers: ExitHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!active) return;
    let prev: AppStateStatus = (AppState.currentState as AppStateStatus | null) ?? "active";
    let background = false;
    let split = false;
    let away = false;
    let hold: ReturnType<typeof setTimeout> | undefined;

    const settle = (at: number) => {
      const next = background || split;
      if (next === away) return;
      away = next;
      if (away) latest.current.onLeft(at);
      else latest.current.onReturned();
    };

    const appSub = AppState.addEventListener("change", (next) => {
      const signal = exitTransition(prev, next);
      prev = trackedState(prev, next);
      if (signal === null) return;
      background = signal === "left";
      settle(Date.now());
    });

    const onSize = ({ window, screen }: { window: ScaledSize; screen: ScaledSize }) => {
      if (Platform.OS !== "android") return;
      if (!isMultiWindow(window, screen)) {
        clearTimeout(hold);
        hold = undefined;
        split = false;
        settle(Date.now());
        return;
      }
      if (split || hold !== undefined) return;
      const since = Date.now();
      hold = setTimeout(() => {
        hold = undefined;
        split = true;
        settle(since);
      }, SPLIT_HOLD_MS);
    };
    const sizeSub = Dimensions.addEventListener("change", onSize);
    onSize({ window: Dimensions.get("window"), screen: Dimensions.get("screen") });

    return () => {
      appSub.remove();
      sizeSub.remove();
      clearTimeout(hold);
    };
  }, [active]);
}
