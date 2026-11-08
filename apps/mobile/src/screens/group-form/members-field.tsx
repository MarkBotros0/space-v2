import type { SeasonRosterRow } from "@space/shared";
import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { Badge } from "../../design/ui/badge";
import { Button } from "../../design/ui/button";
import { Checkbox } from "../../design/ui/checkbox";
import { OptionSearch } from "../../design/ui/combobox";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { Sheet } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { memberSections, membersSummary } from "./members-model";

iconWithClassName(ChevronDown);

/**
 * The group form's Members: a field showing who is picked, and a sheet of the
 * season's people in three sections (In this group, Not in a group, In another
 * group), each row saying where they are now. With nobody in the season it
 * says so and points to the season page, where people are added.
 */
export function MembersField({
  roster,
  groupId,
  seasonTitle,
  value,
  onChange,
  onOpenSeason,
  status,
}: {
  roster: SeasonRosterRow[];
  groupId: number | null;
  seasonTitle: string;
  value: number[];
  onChange: (ids: number[]) => void;
  /** Back to the season page, where Community and Invite new live. */
  onOpenSeason?: () => void;
  status: "loading" | "error" | "ready";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const picked = new Set(value);
  const names = new Map(roster.map((r) => [r.userId, r.name ?? r.email]));

  if (status === "ready" && roster.length === 0) {
    return (
      <View testID="members-empty" className="flex-col gap-2 rounded-control bg-info-soft p-3">
        <Text variant="subhead" className="text-foreground">
          {`Nobody is in ${seasonTitle} yet. Add people to the season first, from the season page.`}
        </Text>
        {onOpenSeason ? (
          <Button variant="secondary" size="sm" className="self-start" onPress={onOpenSeason}>
            Go to the season page
          </Button>
        ) : null}
      </View>
    );
  }

  const toggle = (id: number) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const sections = memberSections(roster, groupId, query);

  return (
    <View className="flex-col gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Members"
        accessibilityHint={status === "ready" ? membersSummary(roster, value, groupId) : undefined}
        disabled={status !== "ready"}
        onPress={() => setOpen(true)}
        className="min-h-[44px] w-full flex-row flex-wrap items-center gap-1 rounded-control border border-control-border bg-surface px-2 py-1.5"
      >
        {value.length === 0 ? (
          <Text variant="subhead" className="px-1 text-muted-foreground">
            {status === "loading" ? "Loading…" : status === "error" ? "Couldn't load the season's people." : "Pick members…"}
          </Text>
        ) : (
          value.map((id) => (
            <Badge key={id} variant="secondary">
              {names.get(id) ?? "Unnamed"}
            </Badge>
          ))
        )}
        <ChevronDown size={16} className="ml-auto shrink-0 text-muted-foreground" />
      </Pressable>
      {status === "ready" ? (
        <Text variant="caption" className="text-muted-foreground">
          {membersSummary(roster, value, groupId)}
        </Text>
      ) : null}
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        title={`Members from ${seasonTitle}`}
        avoidKeyboard
      >
        <OptionSearch value={query} onChangeText={setQuery} />
        {sections.length === 0 ? (
          <Text variant="subhead" className="px-3 py-4 text-center text-muted-foreground">
            {`No one in ${seasonTitle} matches.`}
          </Text>
        ) : (
          sections.map((section) => (
            <View key={section.key} className="flex-col">
              <ListSectionHeader className="px-2 pb-1 pt-3">{section.title}</ListSectionHeader>
              {section.rows.map((row) => {
                const on = picked.has(row.id);
                return (
                  <Pressable
                    key={row.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${row.name}. ${row.line}`}
                    onPress={() => toggle(row.id)}
                    className="min-h-[44px] w-full flex-row items-center gap-3 rounded-control px-2 py-2 active:bg-accent"
                  >
                    {/* Drawn only: the row is the control, so a screen reader meets one checkbox. */}
                    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Checkbox checked={on} onCheckedChange={() => {}} accessibilityLabel={row.name} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="body" className="text-foreground">
                        {row.name}
                      </Text>
                      <Text variant="caption" className="text-muted-foreground">
                        {row.line}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </Sheet>
    </View>
  );
}
