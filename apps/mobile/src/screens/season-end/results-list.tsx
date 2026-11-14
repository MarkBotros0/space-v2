/**
 * The body of a finished season's Results (owner 2026-11-14): a summary of how many passed, did
 * not pass and have no result, the criteria End used (or why there is no score), a filter by
 * result, and one card per student with their attendance, assignments and quizzes.
 */
import type { SeasonResultRow, SeasonResultsResponse } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { SegmentedControl, Text } from "../../design/ui";
import { ResultCard } from "./result-card";
import { criteriaLine, filterRows, resultCardView, summarize, type ResultFilter } from "./results-model";

function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <View className="min-w-0 flex-1 flex-col gap-0.5">
      <Text variant="title" tabular className={tone}>
        {String(value)}
      </Text>
      <Text variant="caption" className="text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ResultsList({ data, onOpen }: { data: SeasonResultsResponse; onOpen: (row: SeasonResultRow) => void }) {
  const [filter, setFilter] = useState<ResultFilter>("all");
  const sum = summarize(data.results);
  const options: { value: ResultFilter; label: string; accessibilityLabel: string }[] = [
    { value: "all", label: "All", accessibilityLabel: `All, ${sum.total}` },
  ];
  if (sum.passed > 0) options.push({ value: "passed", label: "Passed", accessibilityLabel: `Passed, ${sum.passed}` });
  if (sum.notPassed > 0)
    options.push({ value: "not_passed", label: "Not passed", accessibilityLabel: `Not passed, ${sum.notPassed}` });
  if (sum.none > 0) options.push({ value: "none", label: "No result", accessibilityLabel: `No result, ${sum.none}` });
  // A correction can empty the chosen filter; fall back to everyone.
  const shown = options.some((o) => o.value === filter) ? filter : "all";
  const rows = filterRows(data.results, shown);

  return (
    <View className="flex-col gap-4">
      <View
        testID="results-summary"
        className="flex-col gap-3 rounded-group bg-surface p-4 dark:border dark:border-separator"
      >
        <View className="flex-row gap-4">
          <Count value={sum.passed} label="Passed" tone="text-ok" />
          <Count value={sum.notPassed} label="Did not pass" tone="text-bad" />
          {sum.none > 0 ? <Count value={sum.none} label="No result" tone="text-foreground" /> : null}
        </View>
        <Text variant="caption" className="text-muted-foreground">
          {criteriaLine(data.criteria)}
        </Text>
      </View>
      {options.length > 2 ? (
        <SegmentedControl options={options} value={shown} onChange={(v) => setFilter(v as ResultFilter)} />
      ) : null}
      <View className="flex-col gap-3">
        {rows.map((r) => (
          <ResultCard key={r.userId} name={r.name} view={resultCardView(r, data.criteria)} onPress={() => onOpen(r)} />
        ))}
      </View>
    </View>
  );
}
