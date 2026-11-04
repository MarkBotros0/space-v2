import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { FormErrorBox } from "../../design/forms/form-parts";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { cn } from "../../design/lib/cn";
import {
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from "../../design/ui";
import type { useImportTemplate } from "../../hooks/use-import";
import type { useSeasons } from "../../hooks/use-seasons";
import type { StudentImportFlow } from "./use-student-import-flow";

const CURRENT_YEAR = new Date().getFullYear();

/** v1's two "Import as" tiles: `flex-1 rounded-lg border px-4 py-3`. */
function ModeTile({
  title,
  caption,
  selected,
  onPress,
}: {
  title: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "rounded-[14px] border px-4 py-3",
        selected
          ? "border-ring bg-accent"
          : "border-control-border bg-surface active:bg-accent",
      )}
    >
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <Text className="text-xs text-muted-foreground">{caption}</Text>
    </Pressable>
  );
}

/** Step 1: who to import as, where, and the pasted rows. */
export function ImportPasteStep({
  header,
  flow,
  template,
  seasons,
}: {
  header: ReactNode;
  flow: StudentImportFlow;
  template: ReturnType<typeof useImportTemplate>;
  seasons: ReturnType<typeof useSeasons>;
}) {
  const { mode, seasonId, graduationYear } = flow;
  const seasonItems: Record<string, string> = Object.fromEntries(
    (seasons.data ?? []).map((s) => [String(s.id), s.title]),
  );
  const yearNum = Number(graduationYear);
  const yearInvalid =
    graduationYear !== "" &&
    !(/^\d{4}$/.test(graduationYear) && yearNum >= 1990 && yearNum <= CURRENT_YEAR);

  return (
    <View className="flex-col gap-4">
      {header}
      <Card>
        <CardContent className="pt-6">
          <View className="flex-col gap-4">
            <FormField label="Import as" required>
              <View className="flex-col gap-2">
                <ModeTile
                  title="Active students"
                  caption="Enroll in a season"
                  selected={mode === "season"}
                  onPress={() => flow.setMode("season")}
                />
                <ModeTile
                  title="Alumni"
                  caption="Graduated, no season"
                  selected={mode === "alumni"}
                  onPress={() => flow.setMode("alumni")}
                />
              </View>
            </FormField>

            {mode === "season" ? (
              // Preview stays enabled without a season — the target is only needed at
              // commit — but the commit button is disabled until one is chosen. Draft and
              // archived seasons are listed too: v1's picker offers every non-deleted
              // season (spec 16 R37).
              seasons.isPending ? (
                <RouteSkeleton />
              ) : seasons.isError ? (
                <RouteError onRetry={() => void seasons.refetch()} />
              ) : (seasons.data ?? []).length === 0 ? (
                <View className="rounded-[14px] bg-warn-soft px-3 py-2">
                  <Text className="text-sm text-warning-800 dark:text-warning-200">
                    No seasons yet — create a season first, or import these people as alumni
                    instead.
                  </Text>
                </View>
              ) : (
                <FormField label="Season" required>
                  <Select
                    items={seasonItems}
                    value={seasonId === null ? null : String(seasonId)}
                    onValueChange={(v) => flow.setSeasonId(Number(v))}
                  >
                    <SelectTrigger accessibilityLabel="Season">
                      <SelectValue placeholder="Choose the season to enroll students in" />
                    </SelectTrigger>
                    <SelectContent>
                      {(seasons.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )
            ) : (
              <FormField
                label="JPCS graduation year"
                required
                error={yearInvalid ? `Enter a year between 1990 and ${CURRENT_YEAR}.` : undefined}
              >
                <Input
                  accessibilityLabel="Graduation year"
                  value={graduationYear}
                  onChangeText={flow.setGraduationYear}
                  keyboardType="number-pad"
                />
              </FormField>
            )}

            <FormField label="Paste your spreadsheet" required>
              <Textarea
                accessibilityLabel="Paste your spreadsheet"
                className="min-h-40"
                value={flow.text}
                onChangeText={flow.setText}
                placeholder={template.data?.headerRow}
                autoCapitalize="none"
              />
              <View className="mt-1 flex-col gap-0.5">
                <Text className="text-xs font-medium text-muted-foreground">
                  Columns we recognise
                </Text>
                {template.data?.columns.map((c) => (
                  <Text key={c.label} className="text-xs text-muted-foreground">
                    {`${c.label}${c.required ? " (required)" : ""} — ${c.acceptedHeaders.join(", ")}`}
                  </Text>
                ))}
                <Text selectable className="text-xs text-muted-foreground">
                  {template.data?.headerRow}
                </Text>
              </View>
            </FormField>

            {template.data?.capabilities.fileUpload === false ? (
              <Text className="text-xs text-muted-foreground">
                Pasting is the only way in right now — file upload arrives with the CMS.
              </Text>
            ) : null}

            <FormErrorBox message={flow.localError} />
            <Button variant="outline" disabled={flow.previewPending} onPress={flow.runPreview}>
              {flow.previewPending ? "Reading…" : "Preview"}
            </Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}
