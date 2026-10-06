import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { createUserRequestSchema, userRoleSchema, type CreateUserBody, type UserRole } from "@space/shared";

import { ChoiceChips } from "../../../src/components/ChoiceChips";
import { useCreateUser } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, EmptyState, Input, Screen, Text } from "../../../src/ui";

type FieldErrors = Partial<Record<"name" | "email" | "graduationYear", string>>;

const ROLE_OPTIONS = userRoleSchema.options.map((role) => ({ value: role, label: role }));

/**
 * /users/new (spec 11 §9; v1 super/users/new + user-form.tsx). Over Plan 9's
 * invite-first POST /users: no password is set and the server mails the
 * invite — so v1's on-screen "temp password is ChangeMe123!" notice (R43) has
 * no counterpart here. Validation runs the ONE shared schema (R55: v1's form
 * re-implemented it and drifted). A SUPER grant asks first and only then sends
 * confirmSuper (Plan 10 Decision 13).
 */
export default function NewUserScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const createUser = useCreateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [gradYear, setGradYear] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="New user" message="Only SUPER accounts can create users." />
      </Screen>
    );
  }

  const create = (body: CreateUserBody) =>
    createUser.mutate(body, {
      onSuccess: (created) =>
        router.replace({ pathname: "/user/[id]", params: { id: String(created.userId) } }),
      onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the user.")),
    });

  const submit = () => {
    setServerError(null);
    const trimmedYear = gradYear.trim();
    if (trimmedYear !== "" && !/^\d{4}$/.test(trimmedYear)) {
      setErrors({ graduationYear: "Must be a year." });
      return;
    }
    const parsed = createUserRequestSchema.safeParse({
      name,
      email: email.trim(),
      role,
      graduationYear: trimmedYear === "" ? null : Number(trimmedYear),
    });
    if (!parsed.success) {
      const found: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "name" || key === "email" || key === "graduationYear") && found[key] === undefined) {
          found[key] = issue.message;
        }
      }
      setErrors(found);
      return;
    }
    setErrors({});
    if (parsed.data.role === "SUPER") {
      Alert.alert(
        "Create a SUPER account?",
        "SUPER can manage every user and season, and can't be limited by scope.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Create SUPER", onPress: () => create({ ...parsed.data, confirmSuper: true }) },
        ],
      );
      return;
    }
    create(parsed.data);
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="title">New user</Text>
        <Text variant="body" color={theme.colors.neutral[600]}>
          They'll get an email invite to choose their own password. No temporary password is created.
        </Text>
        {serverError ? (
          <Text variant="body" color={theme.colors.error[600]} accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <Input label="Name" value={name} onChangeText={setName} error={errors.name} />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
        />
        <ChoiceChips label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
        <Input
          label="Graduation year"
          value={gradYear}
          onChangeText={setGradYear}
          keyboardType="number-pad"
          placeholder="Required for LEADER, ADMIN and MENTOR"
          error={errors.graduationYear}
        />
        <Button title="Create and send invite" onPress={submit} loading={createUser.isPending} />
      </View>
    </Screen>
  );
}
