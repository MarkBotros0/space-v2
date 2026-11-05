import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import type { CreateUserBody } from "@space/shared";

import { NEW_USER_VALUES, UserForm } from "../../../src/components/UserForm";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState, toast } from "../../../src/design/ui";
import { useCreateUser } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";

/**
 * /users/new (spec 11 §9; v1 super/users/new + user-form.tsx). Over Plan 9's
 * invite-first POST /users: no password is set and the server mails the
 * invite — so v1's on-screen "temp password is ChangeMe123!" notice (R43) has
 * no counterpart here; the subtitle says what happens instead. A SUPER grant
 * asks first and only then sends confirmSuper (Plan 10 Decision 13).
 */
export default function NewUserScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const createUser = useCreateUser();
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <Screen title="New user">
        <EmptyState title="Not available" description="Only SUPER accounts can create users." />
      </Screen>
    );
  }

  const create = (body: CreateUserBody) =>
    createUser.mutate(body, {
      onSuccess: (created) => {
        // The account exists either way; an undelivered invite is withdrawn
        // server-side, so the detail screen offers "Send invite" again.
        if (created.inviteSent) toast.success("User created. Their invite is on its way.");
        else {
          toast.error(
            "User created, but the invite email couldn't be sent. Use Send invite on their page once email works.",
          );
        }
        router.replace({ pathname: "/user/[id]", params: { id: String(created.userId) } });
      },
      onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the user.")),
    });

  return (
    <UserForm
      mode="create"
      title="New user"
      subtitle="They'll get an email invite to choose their own password. No temporary password is created."
      initial={NEW_USER_VALUES}
      submitting={createUser.isPending}
      message={serverError}
      onSubmit={(submit) => {
        setServerError(null);
        if (submit.mode !== "create") return;
        if (submit.body.role === "SUPER") {
          Alert.alert(
            "Create a SUPER account?",
            "SUPER can manage every user and season, and can't be limited by scope.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Create SUPER",
                onPress: () => create({ ...submit.body, confirmSuper: true }),
              },
            ],
          );
          return;
        }
        create(submit.body);
      }}
    />
  );
}
