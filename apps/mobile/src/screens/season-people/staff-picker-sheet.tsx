import { useMemo, useState } from "react";
import { View } from "react-native";

import { GroupedList, ListRow, SearchField, Sheet, Skeleton, Text } from "../../design/ui";
import { useStaffCandidates } from "../../hooks/use-season-admins";
import { apiErrorMessage } from "../../lib/api-error";

/** A person the sheet offers: a staff candidate, or one of the `extra` people the caller adds. */
export type StaffPick = { id: number; name: string; description?: string };

/**
 * Who can take a staff seat (season admin or group leader), as a bottom sheet:
 * a name and the last season, nothing else, so an admin sees no one's record.
 * The rows come from `GET /seasons/:id/staff-candidates` (alumni with no active
 * role) plus the caller's `extra` people, minus `excludeIds`. Tapping a row hands
 * the person to `onPick`; the sheet closes when that resolves and, when it
 * throws, says the server's reason in words and stays open.
 */
export function StaffPickerSheet({
  open,
  onClose,
  seasonId,
  title,
  onPick,
  excludeIds = [],
  extra = [],
}: {
  open: boolean;
  onClose: () => void;
  seasonId: number;
  title: string;
  onPick: (person: StaffPick) => void | Promise<void>;
  excludeIds?: number[];
  extra?: StaffPick[];
}) {
  const candidates = useStaffCandidates(seasonId, { enabled: open });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const byId = new Map<number, StaffPick>();
    for (const c of candidates.data ?? []) byId.set(c.id, { id: c.id, name: c.name, description: c.lastSeason?.title });
    for (const e of extra) if (!byId.has(e.id)) byId.set(e.id, e);
    const skip = new Set(excludeIds);
    const q = query.trim().toLowerCase();
    return [...byId.values()]
      .filter((p) => !skip.has(p.id) && (q === "" || p.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [candidates.data, extra, excludeIds, query]);

  const close = () => {
    setQuery("");
    setError(null);
    onClose();
  };

  const choose = async (person: StaffPick) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onPick(person);
      setQuery("");
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't add them."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={title}>
      <StaffPickerBody
        people={people}
        state={candidates.isPending && open ? "loading" : candidates.isError && extra.length === 0 ? "error" : "ready"}
        query={query}
        onQuery={setQuery}
        error={error}
        onPick={(p) => void choose(p)}
      />
    </Sheet>
  );
}

/** The sheet's content, apart from the data: the design catalogue draws every state of it. */
export function StaffPickerBody({
  people,
  state,
  query,
  onQuery,
  error,
  onPick,
}: {
  people: StaffPick[];
  state: "loading" | "error" | "ready";
  query: string;
  onQuery: (q: string) => void;
  /** The server's reason for a refused pick, in words. */
  error: string | null;
  onPick: (person: StaffPick) => void;
}) {
  let list;
  if (state === "loading") list = <Skeleton className="h-12 w-full" />;
  else if (state === "error")
    list = (
      <Text variant="subhead" className="text-bad">
        Couldn't load the people who can be added.
      </Text>
    );
  else if (people.length === 0)
    list = (
      <Text variant="subhead" className="text-foreground">
        {query.trim() === "" ? "There is no one else to add." : "No one matches that search."}
      </Text>
    );
  else
    list = (
      <GroupedList>
        {people.map((p, i) => (
          <ListRow key={p.id} index={i} title={p.name} subtitle={p.description} onPress={() => onPick(p)} />
        ))}
      </GroupedList>
    );
  return (
    <View className="flex-col gap-3">
      <SearchField value={query} onChangeText={onQuery} placeholder="Search people" />
      {error ? (
        <Text variant="subhead" className="text-bad" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {list}
    </View>
  );
}
