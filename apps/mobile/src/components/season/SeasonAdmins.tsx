import { Trash2, UserPlus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, ConfirmDialog, GroupedList, ListRow, Skeleton, Text, toast } from "../../design/ui";
import { useGroupDetails, useSeasonGroups } from "../../hooks/use-groups";
import { useAddSeasonAdmin, useRemoveSeasonAdmin, useSeasonAdmins } from "../../hooks/use-season-admins";
import { apiErrorMessage } from "../../lib/api-error";
import { StaffPickerSheet, type StaffPick } from "../../screens/season-people/staff-picker-sheet";

iconWithClassName(Trash2, UserPlus);

/**
 * SUPER's "Admins" card on the season detail overview. V2-ONLY: v1 had no way
 * to create a SeasonAdmin row (owner decision). Lists the season's admins with
 * a confirmed remove, and adds one through the staff picker sheet (alumni with
 * no active role, and this season's leaders). A refusal is said in the sheet, in
 * the server's words. Seats don't sign anyone out: the person's next token
 * refresh picks the role up.
 */
export function SeasonAdmins({ seasonId, seasonTitle }: { seasonId: number; seasonTitle: string }) {
  const admins = useSeasonAdmins(seasonId, { enabled: true });
  const add = useAddSeasonAdmin(seasonId);
  const remove = useRemoveSeasonAdmin(seasonId);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<{ userId: number; name: string } | null>(null);

  const current = useMemo(() => admins.data ?? [], [admins.data]);
  const takenIds = useMemo(() => current.map((a) => a.userId), [current]);
  // This season's leaders may also be its admin, though they aren't free staff
  // candidates. Read only once the sheet opens: the list rows carry no leader ids.
  const groups = useSeasonGroups(picking ? seasonId : null);
  const groupIds = useMemo(() => (picking ? (groups.data ?? []).map((g) => g.id) : []), [picking, groups.data]);
  const groupDetails = useGroupDetails(groupIds);
  const leaders: StaffPick[] = groupDetails.flatMap((g) =>
    (g.data?.leaders ?? []).map((l) => ({
      id: l.id,
      name: l.name ?? l.email ?? "Unnamed",
      description: "Leads a group",
    })),
  );

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
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" onPress={() => setPicking(true)}>
          <UserPlus size={14} className="text-primary-foreground" />
          Add admin
        </Button>
      </View>
      <StaffPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        seasonId={seasonId}
        title="Add admin"
        excludeIds={takenIds}
        extra={leaders}
        confirm={(person) => ({
          title: "Add admin?",
          description: `${person.name} will be able to administer ${seasonTitle}.`,
          confirmLabel: "Add",
        })}
        onPick={async (person) => {
          await add.mutateAsync({ userId: person.id });
          toast.success(`${person.name} can now administer ${seasonTitle}.`);
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Remove admin?"
        description={confirm ? `${confirm.name} will no longer be able to administer ${seasonTitle}.` : undefined}
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
