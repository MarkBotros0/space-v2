import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import type { PeopleCandidate } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { Button, ConfirmDialog, EmptyState, ListSectionHeader, toast } from "../../design/ui";
import { useAddSeasonPeople, useSeasonPeople } from "../../hooks/use-season-people";
import { apiErrorCode, apiErrorMessage } from "../../lib/api-error";
import { CandidateRow } from "./candidate-row";
import {
  ANY_SEASON,
  blockPhrase,
  buildItems,
  filterPeople,
  inPool,
  lastSeasonTitles,
  selectAllTargets,
  type PeopleFilters,
  type PeopleItem,
  type Pool,
} from "./model";
import { PeopleFilterBar } from "./people-filters";

const noun = (n: number) => (n === 1 ? "1 person" : `${n} people`);
const keyOf = (item: PeopleItem) => item.key;

/**
 * The people picker: who can join a season, over the fetched list (search and
 * filters run on the phone; about 200 rows). Ticks live in state apart from
 * the filters, so narrowing the list never loses one. Adding is all or nothing:
 * a refusal refetches and takes off the selection whoever can't join any more.
 */
export function PeopleList({
  seasonId,
  seasonTitle,
  onInviteNew,
}: {
  seasonId: number;
  seasonTitle: string;
  /** Someone with no account yet: the invite form (owner, 2026-11-07: season admins invite people). */
  onInviteNew?: () => void;
}) {
  const router = useRouter();
  const candidates = useSeasonPeople(seasonId, { enabled: true });
  const add = useAddSeasonPeople(seasonId);
  const [filters, setFilters] = useState<PeopleFilters>({ query: "", lastSeason: ANY_SEASON, availableOnly: false });
  const [pool, setPool] = useState<Pool>("student");
  const listRef = useRef<FlatList<PeopleItem>>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [overridden, setOverridden] = useState<ReadonlySet<number>>(new Set());
  const [asking, setAsking] = useState<PeopleCandidate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const people = candidates.data?.people;
  const requiredProgram = candidates.data?.season.requiredProgram ?? null;
  const wide = candidates.data?.season.isCommunityWide ?? false;
  const filtered = useMemo(() => (people ? filterPeople(people, filters) : []), [people, filters]);
  const visible = useMemo(() => (wide ? inPool(filtered, pool) : filtered), [wide, filtered, pool]);
  const items = useMemo(() => buildItems(visible), [visible]);
  const titles = useMemo(() => (people ? lastSeasonTitles(people) : []), [people]);
  const targets = useMemo(() => people ? selectAllTargets(people, filters) : [], [people, filters]);
  const allTicked = targets.length > 0 && targets.every((id) => selected.has(id));

  const filtersOn = filters.query.trim() !== "" || filters.lastSeason !== ANY_SEASON || filters.availableOnly;
  const switchPool = (next: Pool) => {
    setPool(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const otherPool: Pool = pool === "student" ? "alumni" : "student";
  const tickedOnOther = useMemo(
    () => (wide && people ? people.some((p) => p.pool === otherPool && selected.has(p.id)) : false),
    [wide, people, otherPool, selected],
  );

  const toggle = useCallback((id: number) => {
    setNotice(null);
    setSelected((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const ask = useCallback((person: PeopleCandidate) => setAsking(person), []);

  const selectAll = () => {
    setNotice(null);
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of targets) {
        if (allTicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const confirmOverride = () => {
    if (!asking) return;
    setOverridden((cur) => new Set(cur).add(asking.id));
    setSelected((cur) => new Set(cur).add(asking.id));
    setAsking(null);
  };

  const submit = () => {
    if (selected.size === 0 || add.isPending) return;
    const userIds = [...selected];
    const overrideUserIds = userIds.filter((id) => overridden.has(id));
    setNotice(null);
    add.mutate(overrideUserIds.length > 0 ? { userIds, overrideUserIds } : { userIds }, {
      onSuccess: (added) => {
        toast.success(`Added ${noun(added)}`);
        router.back();
      },
      onError: (err) => {
        const message = apiErrorMessage(err, "Couldn't add them.");
        toast.error(message);
        if (apiErrorCode(err) !== "people_unavailable") {
          setNotice(message);
          return;
        }
        void candidates.refetch().then((res) => {
          const fresh = new Map((res.data?.people ?? []).map((p) => [p.id, p]));
          const stillOk = (id: number) => {
            const p = fresh.get(id);
            return !!p && (p.selectable || (overridden.has(id) && p.overridable));
          };
          const dropped = userIds.filter((id) => !stillOk(id)).length;
          setSelected(new Set(userIds.filter(stillOk)));
          setNotice(
            dropped > 0
              ? `${message}. ${noun(dropped)} ${dropped === 1 ? "was" : "were"} taken off your selection. Check the rest and add again.`
              : message,
          );
        });
      },
    });
  };

  const frame = (body: React.ReactNode, footer?: React.ReactNode) => (
    <Screen
      title={`Add people to ${seasonTitle}`}
      subtitle={requiredProgram ? `Requires ${requiredProgram}` : undefined}
      scroll={false}
      footer={footer}
      trailing={onInviteNew ? <Button onPress={onInviteNew}>Invite new</Button> : undefined}
    >
      {body}
    </Screen>
  );

  if (candidates.isPending) return frame(<RouteSkeleton />);
  if (candidates.isError) return frame(<RouteError onRetry={() => void candidates.refetch()} />);
  if (candidates.data.people.length === 0) {
    return frame(
      <EmptyState
        icon={Users}
        title="No one to add"
        description="There are no student accounts to add to this season."
        action={onInviteNew ? { label: "Invite someone new", onPress: onInviteNew } : undefined}
      />,
    );
  }

  return frame(
    <>
      <FlatList
        ref={listRef}
        className="flex-1"
        data={items}
        keyExtractor={keyOf}
        initialNumToRender={20}
        windowSize={9}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <PeopleFilterBar
            filters={filters}
            onChange={setFilters}
            titles={titles}
            allTicked={allTicked}
            targetCount={targets.length}
            pool={wide ? pool : null}
            onPool={switchPool}
            onSelectAll={selectAll}
          />
        }
        ListEmptyComponent={
          wide ? (
            <EmptyState
              title={pool === "alumni" ? "No alumni to show" : "No students to show"}
              description={
                tickedOnOther
                  ? `Someone is ticked on the ${otherPool === "alumni" ? "Alumni" : "Students"} tab.`
                  : filtersOn
                    ? "Try a different name or clear a filter."
                    : undefined
              }
            />
          ) : (
            <EmptyState title="No one matches" description="Try a different name or clear a filter." />
          )
        }
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <ListSectionHeader className="px-4 pb-1.5 pt-5">{item.title}</ListSectionHeader>
          ) : (
            <CandidateRow
              person={item.person}
              selected={selected.has(item.person.id)}
              overridden={overridden.has(item.person.id)}
              onToggle={toggle}
              onOverride={ask}
            />
          )
        }
      />
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        title={asking ? `Add ${asking.name} even though they ${blockPhrase(asking, requiredProgram)}?` : ""}
        confirmLabel="Add anyway"
        onConfirm={confirmOverride}
      />
    </>,
    <SaveBar
      label={`Add ${noun(selected.size)}`}
      onPress={submit}
      loading={add.isPending}
      disabled={selected.size === 0}
      disabledReason="Tick at least one person."
      error={notice}
    />,
  );
}
