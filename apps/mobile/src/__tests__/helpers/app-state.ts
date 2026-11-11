import { AppState, type AppStateStatus } from "react-native";

const realCurrentState = Object.getOwnPropertyDescriptor(AppState, "currentState");
/** What `AppState.currentState` reads (React Native's Jest mock makes it a function). */
export function setCurrentAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
}
export function resetCurrentAppState() {
  if (realCurrentState) Object.defineProperty(AppState, "currentState", realCurrentState);
}
