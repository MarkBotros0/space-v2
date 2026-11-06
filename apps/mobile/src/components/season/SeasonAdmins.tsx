import { Trash2, UserPlus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, Combobox, ConfirmDialog, GroupedList, ListRow, Skeleton, Text, toast } from "../../design/ui";
import {
  useAddSeasonAdmin,
  useRemoveSeasonAdmin,
  useSeasonAdmins,
  useStaffCandidates,
} from "../../hooks/use-season-admins";
import { apiErrorMessage } from "../../lib/api-error";

iconWithClassName(Trash2, UserPlus);

/**
 * SUPER's "Admins" card on the season detail overview. V2-ONLY: v1 had no way
 * to create a SeasonAdmin row (owner decision). Lists the season's admins with
 * a confirmed remove, and adds one by picking from the season's staff
 * candidates (alumni with no active role). Seats don't sign anyone out: the
 * person's next token refresh picks the role up. Task 10 replaces the picker.
 */
export function SeasonAdmins({ seasonId, seasonTitle }: { seasonId: number; seasonTitle: string }) {
  const admins = useSeasonAdmins(seasonId, { enabled: true });
  const candidates = useStaffCandidates(seasonId, { enabled: true });
  const add = useAddSeasonAdmin(seasonId);
  const remove = useRemoveSeasonAdmin(seasonId);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ userId: number; name: string } | null>(null);
  const [confirmingAdd, setConfirmingAdd] = useState(false);

  const current = useMemo(() => admins.data ?? [], [admins.data]);
  const options = useMemo(() => {
    const taken = new Set(current.map((a) => a.userId));
    return (candidates.data ?? [])
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ value: String(p.id), label: p.name, description: p.lastSeason?.title }));
  }, [candidates.data, current]);

  const pickedOption = options.find((o) => o.value === picked);
  // The pick can leave the options mid-confirm (someone else added them); the dialog
  // then hides, and the next pick must not open it without Add being pressed (final review M10).
  useEffect(() => {
    if (pickedOption === undefined) setConfirmingAdd(false);
  }, [pickedOption]);

  const submitAdd = () => {
    if (picked === null) return;
    const option = pickedOption;
    add.mutate(
      { userId: Number(picked) },
      {
        onSuccess: () => {
          setConfirmingAdd(false);
          setPicked(null);
          toast.success(`${option?.label ?? "Admin"} can now administer ${seasonTitle}.`);
        },
        onError: (err) => {
          setConfirmingAdd(false);
          toast.error(apiErrorMessage(err, "Couldn't add the admin."));
        },
      },
    );
  };

  let list;
  if (admins.isPending)
    list = (
      <GroupedList header="Admins">
        <View className="p-4">
          <Skeleton className="h-10 w-full" />
        </View>
      </GroupedList>
    );
  else if (admins.isError)
    list = (
      <GroupedList header="Admins">
        <View className="flex-col gap-2 p-4">
          <Text variant="subhead" className="text-bad">
            Couldn't load the admins.
          </Text>
          <Button variant="secondary" size="sm" className="self-start" onPress={() => void admins.refetch()}>
            Try again
          </Button>
        </View>
      </GroupedList>
    );
  else if (current.length === 0)
    list = (
      <GroupedList header="Admins">
        <ListRow title="No admins yet." />
      </GroupedList>
    );
  else
    list = (
      <GroupedList header="Admins">
        {current.map((a) => (
          <ListRow
            key={a.userId}
            title={a.name}
            subtitle={a.email}
            trailing={
              <Button
                variant="secondary"
                size="sm"
                accessibilityLabel={`Remove ${a.name}`}
                onPress={() => setConfirm({ userId: a.userId, name: a.name })}
              >
                <Trash2 size={14} className="text-bad" />
              </Button>
            }
          />
        ))}
      </GroupedList>
    );

  return (
    <View className="flex-col gap-4">
      {list}
      <View className="flex-col gap-4">
        <View className="flex-col gap-2">
          <Combobox
            accessibilityLabel="Choose an admin"
            placeholder={candidates.isPending ? "Loading people…" : "Choose an admin…"}
            emptyMessage="There is no one else to add."
            disabled={candidates.isPending || candidates.isError}
            options={options}
            value={picked}
            onChange={setPicked}
          />
          {candidates.isError ? (
            <Text variant="subhead" className="text-bad">
              Couldn't load the people who can be added.
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" disabled={picked === null || add.isPending} onPress={() => setConfirmingAdd(true)}>
              <UserPlus size={14} className="text-primary-foreground" />
              Add admin
            </Button>
          </View>
        </View>
      </View>
      <ConfirmDialog
        open={confirmingAdd && pickedOption !== undefined}
        onOpenChange={setConfirmingAdd}
        title="Add admin?"
        description={
          pickedOption
            ? `${pickedOption.label} will be able to administer ${seasonTitle}.`
            : undefined
        }
        confirmLabel="Add"
        pending={add.isPending}
        onConfirm={submitAdd}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Remove admin?"
        description={
          confirm
            ? `${confirm.name} will no longer be able to administer ${seasonTitle}.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (confirm === null) return;
          const { userId, name } = confirm;
          remove.mutate(
            { userId },
            {
              onSuccess: () => {
                setConfirm(null);
                toast.success(`${name} was removed as an admin.`);
              },
              onError: (err) => {
                setConfirm(null);
                toast.error(apiErrorMessage(err, "Couldn't remove the admin."));
              },
            },
          );
        }}
      />
    </View>
  );
}
