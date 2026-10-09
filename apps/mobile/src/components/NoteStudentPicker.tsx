import { useState } from "react";
import { Pressable, View } from "react-native";
import type { NoteStudentOption } from "@space/shared";

import { useTheme } from "../theme";
import { Button, Input, Text } from "../ui";

const MAX_MATCHES = 8;

/**
 * Search-and-pick over the mentor's student list — the phone form of v1's
 * Combobox ("Search students…", label = name, description = email;
 * mentor-note-composer.tsx:27-31,68-75). Matches name or email, case-blind;
 * shows a handful of matches rather than the whole school.
 */
export function NoteStudentPicker({
  label,
  options,
  value,
  onChange,
  clearLabel,
}: {
  label: string;
  options: NoteStudentOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Title of the button that clears the choice, e.g. "All students". */
  clearLabel: string;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const selected = value === null ? null : (options.find((o) => o.id === value) ?? null);

  if (selected) {
    return (
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" color={theme.colors.neutral[700]}>
          {label}
        </Text>
        <Text variant="body">{selected.name}</Text>
        <Button title={clearLabel} variant="ghost" onPress={() => onChange(null)} />
      </View>
    );
  }

  const q = query.trim().toLowerCase();
  const matches =
    q === ""
      ? []
      : options
          .filter((o) => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q))
          .slice(0, MAX_MATCHES);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Input label={label} value={query} onChangeText={setQuery} placeholder="Search students…" />
      {q !== "" && matches.length === 0 ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          No students.
        </Text>
      ) : null}
      {matches.map((o) => (
        <Pressable
          key={o.id}
          accessibilityRole="button"
          accessibilityLabel={`${o.name}, ${o.email}`}
          onPress={() => {
            setQuery("");
            onChange(o.id);
          }}
          style={{ paddingVertical: theme.spacing.xs }}
        >
          <Text variant="body">{o.name}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {o.email}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
