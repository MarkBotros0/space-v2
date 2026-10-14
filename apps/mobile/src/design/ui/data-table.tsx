/**
 * Port of v1 src/components/ui/data-table.tsx, phone branch (md:hidden list):
 * first column is the row's primary cell, other headed columns are meta
 * joined by "·" under it, header-less columns are actions on the right.
 * Native differences: string/number cells are wrapped in Text with the
 * classes v1's surrounding element gives them.
 */
import { Fragment, type ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Text } from "./text";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
}

function asNode(content: ReactNode, textClassName: string) {
  return typeof content === "string" || typeof content === "number" ? (
    <Text className={textClassName}>{content}</Text>
  ) : (
    content
  );
}

function DataTable<Row>({
  columns,
  rows,
  rowKey,
  className,
  emptyState,
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  className?: string;
  emptyState?: ReactNode;
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;
  const [primary, ...rest] = columns;
  const metaColumns = rest.filter((col) => col.header !== "");
  const actionColumns = rest.filter((col) => col.header === "");
  return (
    <View className={cn("w-full", className)}>
      <View className="overflow-hidden rounded-2xl border border-border/60 bg-card" style={shadowStyle("soft")}>
        {rows.map((row, i) => (
          <View key={rowKey(row)} className={cn("min-h-11 flex-row items-center gap-3 px-4 py-3", i > 0 && "border-t border-border/60")}>
            <View className="min-w-0 flex-1">
              {primary ? asNode(primary.cell(row), "text-sm text-foreground") : null}
              {metaColumns.length > 0 ? (
                <View className="mt-0.5 flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {metaColumns.map((col, j) => (
                    <Fragment key={col.key}>
                      {j > 0 ? <Text className="text-xs text-muted-foreground">·</Text> : null}
                      <View className="min-w-0">{asNode(col.cell(row), "text-xs text-muted-foreground")}</View>
                    </Fragment>
                  ))}
                </View>
              ) : null}
            </View>
            {actionColumns.length > 0 ? (
              <View className="shrink-0 flex-row items-center gap-1">
                {actionColumns.map((col) => (
                  <Fragment key={col.key}>{asNode(col.cell(row), "text-sm text-foreground")}</Fragment>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export { DataTable };
