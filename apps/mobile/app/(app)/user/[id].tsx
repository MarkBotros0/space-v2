import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { UserDetail } from "@space/shared";

import { UserForm } from "../../../src/components/UserForm";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { Button, Card, CardContent, EmptyState, Text } from "../../../src/design/ui";
import {
  useSendInvite,
  useSetActivation,
  useUpdateUser,
  useUserDetail,
} from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatDate } from "../../../src/lib/format";
import { parsePositiveInt } from "../../../src/lib/params";
import { useSessionStore } from "../../../src/store/session";

/**
 * v1 super/users/[id]/edit (B5-4): "Edit {name}", the email under it, the
 * invite button in the header, then the user form. V2-ONLY kept: the invite's
 * real expiry as a sentence (R75 — the fact v1 showed nowhere), and a SUPER
 * grant asks first and sends confirmSuper only after the confirm (D7 rec 3).
 */
function UserEdit({ data, selfId }: { data: UserDetail; selfId: number }) {
  const router = useRouter();
  const updateUser = useUpdateUser();
  const sendInvite = useSendInvite();
  const setActivation = useSetActivation();
  const [message, setMessage] = useState<string | null>(null);
  const inactive = data.deletedAt !== null;
  const canInvite = !inactive && (data.status === "pending" || data.status === "invited");

  const toggleActivation = () => {
    const action = inactive ? "reactivate" : "deactivate";
    Alert.alert(
      action === "deactivate" ? "Deactivate account?" : "Reactivate account?",
      action === "deactivate"
        ? "They will be signed out everywhere and unable to sign in."
        : "They will be able to sign in again with their existing password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "deactivate" ? "Deactivate" : "Reactivate",
          style: action === "deactivate" ? "destructive" : "default",
          onPress: () => setActivation.mutate({ userId: data.id, action }),
        },
      ],
    );
  };

  return (
    <View className="flex-col gap-4">
      <View className="flex-row items-start justify-between gap-4">
        <PageTitle
          className="min-w-0 flex-1"
          title={`Edit ${data.name || data.email}`}
          subtitle={data.email}
        />
        {canInvite ? (
          <Button
            variant="outline"
            disabled={sendInvite.isPending}
            onPress={() => sendInvite.mutate({ userId: data.id })}
          >
            {sendInvite.isPending
              ? "Sending…"
              : data.status === "invited"
                ? "Resend invite"
                : "Send invite"}
          </Button>
        ) : null}
      </View>
      {data.invite ? (
        <Text className="text-sm text-muted-foreground">
          {data.invite.usedAt
            ? `Invite accepted ${formatDate(data.invite.usedAt)}.`
            : `Invite expires ${formatDate(data.invite.expiresAt)}.`}
          {data.invite.invitedByName ? ` Sent by ${data.invite.invitedByName}.` : ""}
        </Text>
      ) : null}
      {inactive ? (
        <Text className="text-sm text-muted-foreground">
          {`Deactivated ${formatDate(data.deletedAt)}.`}
        </Text>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          <UserForm
            key={data.id}
            mode="edit"
            initial={{
              name: data.name,
              email: data.email,
              role: data.role,
              graduationYear: data.graduationYear === null ? "" : String(data.graduationYear),
            }}
            submitting={updateUser.isPending}
            message={message}
            deactivation={
              selfId === data.id
                ? undefined
                : { inactive, pending: setActivation.isPending, onToggle: toggleActivation }
            }
            onCancel={() => router.back()}
            onSubmit={(submit) => {
              if (submit.mode !== "edit") return;
              setMessage(null);
              const doSave = (confirmSuper: boolean) =>
                updateUser.mutate(
                  {
                    userId: data.id,
                    body: confirmSuper ? { ...submit.body, confirmSuper: true } : submit.body,
                  },
                  {
                    onError: (err) =>
                      setMessage(
                        apiErrorMessage(
                          err,
                          "The change was refused. Check the fields and try again.",
                        ),
                      ),
                  },
                );
              if (submit.body.role === "SUPER" && data.role !== "SUPER") {
                // D7 rec 3, surfaced in the UI the same way the API enforces it.
                Alert.alert(
                  "Grant SUPER?",
                  "SUPER can manage every user and season. This cannot be limited by scope.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Grant SUPER", onPress: () => doSave(true) },
                  ],
                );
                return;
              }
              doSave(false);
            }}
          />
        </CardContent>
      </Card>
      {setActivation.isError ? (
        <Text className="text-sm text-error-600">
          {apiErrorMessage(setActivation.error, "Couldn't change the account.")}
        </Text>
      ) : null}
    </View>
  );
}

export default function UserDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(idParam);
  const me = useSessionStore((s) => s.user);
  // A null id disables the query (useUserDetail passes enabled: id !== null),
  // so a non-SUPER or a malformed param fires nothing.
  const { data, isPending, isError, refetch } = useUserDetail(me?.role === "SUPER" ? id : null);

  if (me?.role !== "SUPER") {
    return (
      <ShellFrame>
        <EmptyState title="Users" description="Only SUPER accounts can manage users." />
      </ShellFrame>
    );
  }
  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="User" description="Invalid user id." />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame>
      {isPending ? (
        <RouteSkeleton />
      ) : isError || !data ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <UserEdit data={data} selfId={me.id} />
      )}
    </ShellFrame>
  );
}
