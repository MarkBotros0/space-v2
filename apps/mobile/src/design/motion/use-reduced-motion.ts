import { useReducedMotion as useReanimatedReducedMotion } from "react-native-reanimated";

let override: boolean | null = null;

/** Tests only: force the reduced-motion answer, or pass null to follow the OS again. */
export function setReducedMotionForTests(value: boolean | null): void {
  override = value;
}

/** True when the OS asks for reduced motion. */
export function useReducedMotion(): boolean {
  const system = useReanimatedReducedMotion();
  return override ?? system;
}
