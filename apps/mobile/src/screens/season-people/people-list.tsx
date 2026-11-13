import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";

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
import { initialSourceId, passersToTick, stragglerPhrase } from "./source";
import { SourcePicker } from "./source-picker";
import { usePeopleSelection } from "./use-people-selection";
import { people as peopleCount } from "../../lib/plural";
import { haptic } from "../../design/motion";

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
  isDraft,
  from,
  onInviteNew,
}: {
  seasonId: number;
  seasonTitle: string;
  isDraft: boolean;
  /** `?from=`: a finished season whose passers open ticked (the season page's suggestion). */
  from: number | null;
  /** Someone with no account yet: the invite form (owner, 2026-11-07: season admins invite people). */
  onInviteNew?: () => void;
}) {
  const router = useRouter();
  const candidates = useSeasonPeople(seasonId, { enabled: true });
  const add = useAddSeasonPeople(seasonId);
  const [filters, setFilters] = useState<PeopleFilters>({ query: "", lastSeason: ANY_SEASON, availableOnly: false });
  const [pool, setPool] = useState<Pool>("student");
  const listRef = useRef<FlatList<PeopleItem>>(null);
  const [selection, pick] = usePeopleSelection();
  const { selected, overridden, chosen, sourceId, autoTicked, asking, notice } = selection;

  const people = candidates.data?.people;
  const requiredProgram = candidates.data?.season.requiredProgram ?? null;
  const wide = candidates.data?.season.isCommunityWide ?? false;
  const filtered = useMemo(() => (people ? filterPeople(people, filters) : []), [people, filters]);
  const visible = useMemo(() => (wide ? inPool(filtered, pool) : filtered), [wide, filtered, pool]);
  const sources = candidates.data?.season.sources ?? [];
  const source = sources.find((x) => x.id === sourceId) ?? null;
  const items = useMemo(() => buildItems(visible, source), [visible, source]);
  const titles = useMemo(() => (people ? lastSeasonTitles(people) : []), [people]);
  const targets = useMemo(() => (people ? selectAllTargets(people, filters) : []), [people, filters]);
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

  const chooseSource = useCallback(
    (id: number | null) => pick.chooseSource(id, id !== null && people ? passersToTick(people, id) : []),
    [people, pick],
  );
  // The first load picks the season to start from (the link's, else the suggestion on an empty draft).
  useEffect(() => {
    if (sourceId !== undefined || !candidates.data) return;
    chooseSource(initialSourceId(candidates.data, { from, isDraft }));
  }, [sourceId, candidates.data, from, isDraft, chooseSource]);

  const toggle = useCallback(
    (id: number) =>
      pick.toggle(
        id,
        people?.find((p) => p.id === id),
      ),
    [people, pick],
  );

  const submit = () => {
    if (selected.size === 0 || add.isPending) return;
    const userIds = [...selected];
    const overrideUserIds = userIds.filter((id) => overridden.has(id));
    pick.notice(null);
    add.mutate(overrideUserIds.length > 0 ? { userIds, overrideUserIds } : { userIds }, {
      onSuccess: () => {
        haptic("success");
        router.back();
      },
      onError: (err) => {
        const message = apiErrorMessage(err, "Couldn't add them.");
        toast.error(message);
        if (apiErrorCode(err) !== "people_unavailable") {
          pick.notice(message);
          return;
        }
        void candidates.refetch().then((res) => {
          const fresh = new Map((res.data?.people ?? []).map((p) => [p.id, p]));
          const stillOk = (id: number) => {
            const p = fresh.get(id);
            return !!p && (p.selectable || (overridden.has(id) && p.overridable));
          };
          const dropped = userIds.filter((id) => !stillOk(id)).length;
          pick.pruneAfterRefusal(
            userIds.filter(stillOk),
            dropped > 0
              ? `${message}. ${peopleCount(dropped)} ${dropped === 1 ? "was" : "were"} taken off your selection. Check the rest and add again.`
              : message,
          );
        });
      },
    });
  };

  const frame = (body: React.ReactNode, footer?: React.ReactNode) => (
    <Screen
      title="Select from community"
      subtitle={`Add people who already have an account to ${seasonTitle}.${requiredProgram ? ` Requires ${requiredProgram}.` : ""}`}
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
        description="There are no accounts to add to this season. Invite someone new instead."
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
          <>
            <SourcePicker sources={sources} value={source} ticked={autoTicked.length} onChange={chooseSource} />
            <PeopleFilterBar
              filters={filters}
              onChange={setFilters}
              titles={titles}
              allTicked={allTicked}
              targetCount={targets.length}
              pool={wide ? pool : null}
              onPool={switchPool}
              onSelectAll={() => pick.selectAll(targets)}
            />
          </>
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
            <EmptyState
              title="No one matches"
              description={
                onInviteNew
                  ? "Not here? They may not have an account yet: invite them instead."
                  : "Try a different name or clear a filter."
              }
              action={onInviteNew ? { label: "Invite new", onPress: onInviteNew } : undefined}
            />
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
              chosen={chosen.has(item.person.id)}
              source={source}
              onToggle={toggle}
              onOverride={pick.ask}
            />
          )
        }
      />
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) pick.cancelAsk();
        }}
        title={
          !asking
            ? ""
            : asking.kind === "override" || !source
              ? `Add ${asking.person.name} even though they ${blockPhrase(asking.person, requiredProgram)}?`
              : `Add ${asking.person.name} even though they ${stragglerPhrase(asking.person, source)}?`
        }
        description={
          asking?.kind === "choice"
            ? "Usually only the people who passed join the next season. Add them only if you mean to."
            : undefined
        }
        confirmLabel="Add anyway"
        onConfirm={pick.confirmAsk}
      />
    </>,
    <SaveBar
      label={`Add ${peopleCount(selected.size)}`}
      onPress={submit}
      loading={add.isPending}
      disabled={selected.size === 0}
      disabledReason="Tick at least one person."
      error={notice}
    />,
  );
}
