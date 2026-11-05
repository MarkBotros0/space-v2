/**
 * Port of v1 src/components/ui/data-table.tsx, phone branch (md:hidden list):
 * first column is the row's primary cell, other headed columns are meta
 * joined by "·" under it, header-less columns are actions on the right.
 * Native differences: string/number cells are wrapped in Text with the
 * classes v1's surrounding element gives them.
 */
import { Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { joinMeta } from "../../lib/join-meta";
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

type MetaSegment =
  | { kind: "text"; key: string; text: string }
  | { kind: "node"; key: string; node: ReactNode };

/**
 * Meta cells in order: a run of plain strings/numbers becomes one "·"-joined
 * Text (joinMeta), an element (a chip, a badge) stands alone. Chips are never
 * joined with a separator, so no "·" is left dangling before one when it wraps.
 */
function metaSegments(cells: ReactNode[]): MetaSegment[] {
  const out: MetaSegment[] = [];
  let run: string[] = [];
  const flush = () => {
    const text = joinMeta(run);
    if (text) out.push({ kind: "text", key: `t${out.length}`, text });
    run = [];
  };
  cells.forEach((cell) => {
    if (typeof cell === "string" || typeof cell === "number") run.push(String(cell));
    else if (cell !== null && cell !== undefined && cell !== false) {
      flush();
      out.push({ kind: "node", key: `n${out.length}`, node: cell });
    }
  });
  flush();
  return out;
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
                  {metaSegments(metaColumns.map((col) => col.cell(row))).map((seg) =>
                    seg.kind === "text" ? (
                      <Text key={seg.key} className="min-w-0 max-w-full shrink text-xs text-muted-foreground">
                        {seg.text}
                      </Text>
                    ) : (
                      <Fragment key={seg.key}>{seg.node}</Fragment>
                    ),
                  )}
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
