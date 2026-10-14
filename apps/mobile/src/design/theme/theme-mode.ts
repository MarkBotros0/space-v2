import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme, useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

/** Same key and values as v1's theme-provider.tsx. */
export const THEME_STORAGE_KEY = "theme";

function isMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

async function readMode(): Promise<ThemeMode> {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Called once at boot, before first paint of the app. */
export async function applyStoredThemeMode(): Promise<void> {
  colorScheme.set(await readMode());
}

export function useThemeMode() {
  const { colorScheme: resolved } = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void readMode().then(setModeState);
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    colorScheme.set(next);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  return { mode, resolved: resolved === "dark" ? "dark" : "light", setMode } as const;
}
