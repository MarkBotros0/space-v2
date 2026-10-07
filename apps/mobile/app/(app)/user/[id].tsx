import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import {
  ALUMNI_ONLY_ROLES,
  userRoleSchema,
  type UserRole,
} from "@space/shared";

import { useSendInvite, useSetActivation, useUpdateUser, useUserDetail } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatDate } from "../../../src/lib/format";
import { parsePositiveInt } from "../../../src/lib/params";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

const ROLES: readonly UserRole[] = userRoleSchema.options;

export default function UserDetailScreen() {
  const theme = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(idParam);

  const me = useSessionStore((s) => s.user);
  // A null id disables the query (useUserDetail passes enabled: id !== null),
  // so a non-SUPER or a malformed param fires nothing.
  const { data, isPending, isError, refetch } = useUserDetail(me?.role === "SUPER" ? id : null);
  const updateUser = useUpdateUser();
  const sendInvite = useSendInvite();
  const setActivation = useSetActivation();

  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [gradYear, setGradYear] = useState("");
  const [gradYearError, setGradYearError] = useState<string | null>(null);

  // Seed the form once the row arrives; a refetch must not clobber edits, so
  // key on the row id, not the object.
  useEffect(() => {
    if (data) {
      setName(data.name);
      setRole(data.role);
      setGradYear(data.graduationYear === null ? "" : String(data.graduationYear));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  if (me?.role !== "SUPER") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Users" message="Only SUPER accounts can manage users." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="User" message="Invalid user id." />
      </Screen>
    );
  }

  const save = () => {
    setGradYearError(null);
    const graduationYear = gradYear.trim() === "" ? null : Number(gradYear.trim());
    if (graduationYear !== null && !Number.isInteger(graduationYear)) {
      setGradYearError("Must be a year.");
      return;
    }
    // Client mirror of the shared refinement — the server re-checks (R55's
    // fix is that BOTH sides run the one schema; the message matches it).
    if (ALUMNI_ONLY_ROLES.includes(role) && graduationYear === null) {
      setGradYearError("Required for this role.");
      return;
    }
    const body = { name: name.trim(), role, graduationYear };
    const doSave = (confirmSuper: boolean) =>
      updateUser.mutate(
        { userId: id, body: confirmSuper ? { ...body, confirmSuper: true } : body },
        {
          onError: (err) =>
            Alert.alert(
              "Couldn't save",
              apiErrorMessage(err, "The change was refused. Check the fields and try again."),
            ),
        },
      );

    if (role === "SUPER" && data?.role !== "SUPER") {
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
  };

  const toggleActivation = () => {
    if (!data) return;
    const action = data.deletedAt === null ? "deactivate" : "reactivate";
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
          onPress: () =>
            setActivation.mutate(
              { userId: id, action },
              { onSuccess: () => void refetch() },
            ),
        },
      ],
    );
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {isPending ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load this user." onRetry={refetch} />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <Card>
            <Text variant="heading">Account</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <Input label="Name" value={name} onChangeText={setName} />
              <Text variant="label" color={theme.colors.neutral[600]}>Email (read-only)</Text>
              <Text variant="body">{data.email}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>Role</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r}
                    accessibilityRole="button"
                    onPress={() => setRole(r)}
                    style={{
                      paddingVertical: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.sm,
                      borderRadius: theme.radii.sm,
                      borderWidth: theme.borderWidths.thin,
                      borderColor: role === r ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
                    }}
                  >
                    <Text variant="label" color={role === r ? theme.colors.brand.navy[900] : theme.colors.neutral[700]}>
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Input
                label="Graduation year"
                value={gradYear}
                onChangeText={setGradYear}
                keyboardType="number-pad"
                error={gradYearError ?? undefined}
              />
              <Button title="Save changes" onPress={save} loading={updateUser.isPending} />
            </View>
          </Card>

          <Card>
            <Text variant="heading">Invite</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              {data.invite ? (
                <Text variant="body">
                  {data.invite.usedAt
                    ? `Invite accepted ${formatDate(data.invite.usedAt)}.`
                    : `Invite expires ${formatDate(data.invite.expiresAt)}.`}
                  {data.invite.invitedByName ? ` Sent by ${data.invite.invitedByName}.` : ""}
                </Text>
              ) : (
                <Text variant="body" color={theme.colors.neutral[600]}>
                  No invite has been sent.
                </Text>
              )}
              {data.status === "pending" || data.status === "invited" ? (
                <Button
                  title={data.status === "invited" ? "Resend invite" : "Send invite"}
                  variant="secondary"
                  loading={sendInvite.isPending}
                  onPress={() =>
                    sendInvite.mutate({ userId: id }, { onSuccess: () => void refetch() })
                  }
                />
              ) : null}
            </View>
          </Card>

          <Card>
            <Text variant="heading">Status</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <Text variant="body">
                {data.deletedAt === null ? "Active account." : `Deactivated ${formatDate(data.deletedAt)}.`}
              </Text>
              {me.id !== data.id ? (
                <Button
                  title={data.deletedAt === null ? "Deactivate" : "Reactivate"}
                  variant="ghost"
                  loading={setActivation.isPending}
                  onPress={toggleActivation}
                />
              ) : (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  You can't deactivate your own account.
                </Text>
              )}
            </View>
          </Card>
        </View>
      )}
    </Screen>
  );
}
