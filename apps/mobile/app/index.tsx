import { Redirect } from "expo-router";

import { useSessionStore } from "../src/store/session";

export default function Index() {
  const status = useSessionStore((s) => s.status);
  if (status === "authenticated") return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
