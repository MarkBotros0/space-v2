/**
 * Port of v1 src/components/ui/data-table.tsx, phone branch (md:hidden list):
 * first column is the row's primary cell, other headed columns are meta
 * joined by "·" under it, header-less columns are actions on the right.
 * Native differences: string/number cells are wrapped in Text with the
 * classes v1's surrounding element gives them.
 */
import { Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
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
  onRowPress,
  onRowPressIn,
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  className?: string;
  emptyState?: ReactNode;
  /** Makes the whole row the tap target, not just a link inside it. */
  onRowPress?: (row: Row) => void;
  onRowPressIn?: (row: Row) => void;
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;
  const [primary, ...rest] = columns;
  const metaColumns = rest.filter((col) => col.header !== "");
  const actionColumns = rest.filter((col) => col.header === "");
  return (
    <View className={cn("w-full", className)}>
      <View className="overflow-hidden rounded-group bg-surface dark:border dark:border-separator">
        {rows.map((row, i) => {
          const Wrapper = onRowPress ? Pressable : View;
          const pressProps = onRowPress
            ? {
                accessibilityRole: "button" as const,
                onPress: () => onRowPress(row),
                onPressIn: onRowPressIn ? () => onRowPressIn(row) : undefined,
              }
            : {};
          return (
          <Wrapper key={rowKey(row)} {...pressProps} className={cn("min-h-11 flex-row items-center gap-3 px-4 py-3", onRowPress && "active:bg-muted/40", i > 0 && "border-t border-border/60")}>
            <View className="min-w-0 flex-1">
              {primary ? asNode(primary.cell(row), "text-foreground") : null}
              {metaColumns.length > 0 ? (
                <View className="mt-0.5 flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {/* The "·" rides with the cell before it: v1's inline flow keeps a
                      separator at the end of the line it ends, never starting the next. */}
                  {metaColumns.map((col, j) => (
                    <View key={col.key} className="min-w-0 max-w-full flex-row items-center gap-x-1.5">
                      {asNode(col.cell(row), "shrink text-xs text-muted-foreground")}
                      {j < metaColumns.length - 1 ? <Text className="text-xs text-muted-foreground">·</Text> : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            {actionColumns.length > 0 ? (
              <View className="shrink-0 flex-row items-center gap-1">
                {actionColumns.map((col) => (
                  <Fragment key={col.key}>{asNode(col.cell(row), "text-foreground")}</Fragment>
                ))}
              </View>
            ) : null}
          </Wrapper>
          );
        })}
      </View>
    </View>
  );
}

export { DataTable };
