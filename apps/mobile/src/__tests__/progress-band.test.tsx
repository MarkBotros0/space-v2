/**
 * The 75 / 50 colour bands, pinned on the screens that draw them (refactor session-tidy step 1):
 * a finished season's result bars and the student page's progress rings. Primary from 75, warn
 * from 50, bad below; nothing to count draws no colour.
 */
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { StudentProgress } from "@space/shared";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

jest.mock("../design/ui/progress-ring", () => {
  const { Text: RNText, View } = jest.requireActual("react-native");
  return {
    ProgressRing: ({ indicatorClassName, children }: { indicatorClassName?: string; children: ReactNode }) => (
      <View>
        <RNText testID="ring-stroke">{indicatorClassName ?? "none"}</RNText>
        {children}
      </View>
    ),
    RingValue: ({ children }: { children: ReactNode }) => <RNText>{children}</RNText>,
  };
});

import { apiClient } from "../lib/api-client";
import { ResultCard } from "../screens/season-end/result-card";
import { SeasonProgressCard } from "../screens/student-detail/season-progress-card";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import type { Meter, ResultCardView } from "../screens/season-end/results-model";

const meter = (key: Meter["key"], pct: number | null): Meter => ({
  key,
  label: key,
  value: pct === null ? "–" : `${pct}%`,
  detail: "",
  pct,
});

function bars(pcts: (number | null)[]): string[] {
  const keys: Meter["key"][] = ["attendance", "assignments", "quizzes"];
  const view: ResultCardView = {
    chip: { tone: "ok", label: "Passed" },
    group: null,
    meters: pcts.map((p, i) => meter(keys[i]!, p)),
    score: null,
    against: null,
    reason: null,
  };
  const { toJSON } = render(<ResultCard name="Sara" view={view} onPress={() => {}} />);
  const found: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { props?: { className?: string }; children?: unknown[] };
    const cls = node.props?.className ?? "";
    const m = /\bh-full (bg-\w+)/.exec(cls);
    if (m) found.push(m[1]!);
    (node.children ?? []).forEach(walk);
  };
  walk(toJSON());
  return found;
}

describe("progress bands", () => {
  it("result bars: primary from 75, warn from 50, bad below", () => {
    expect(bars([75, 74, 50])).toEqual(["bg-primary", "bg-warn", "bg-warn"]);
    expect(bars([49, 100, 0])).toEqual(["bg-bad", "bg-primary", "bg-bad"]);
  });

  it("a result meter with nothing to count draws no bar", () => {
    expect(bars([null, 80, null])).toEqual(["bg-primary"]);
  });

  it("progress rings: primary at 75, warn at 50, bad at 49", async () => {
    const progress: StudentProgress = {
      seasonId: 7,
      seasonTitle: "Spring 2099",
      seasonActive: true,
      canMark: false,
      available: { attendance: true, assignments: true, quizzes: true },
      numbers: {
        attendance: { attended: 15, total: 20 },
        assignments: { submitted: 49, total: 100 },
        quizzes: { scored: 1, max: 2 },
      },
      assignments: [],
      quizzes: [],
    };
    (apiClient.get as jest.Mock).mockImplementation((url: string) =>
      url.endsWith("/progress")
        ? Promise.resolve({ data: { data: progress } })
        : Promise.reject(new Error("not served")),
    );
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonProgressCard studentId={21} studentName="Sara" />);
    expect(await screen.findByText("75%")).toBeTruthy();
    expect(screen.getAllByTestId("ring-stroke").map((n) => n.props.children)).toEqual([
      "stroke-primary",
      "stroke-bad",
      "stroke-warn",
    ]);
  });
});
