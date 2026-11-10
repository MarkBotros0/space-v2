import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  ALUMNI_ONLY_ROLES,
  createUserRequestSchema,
  updateUserRequestSchema,
  userWriteRoleSchema,
  type CreateUserBody,
  type UpdateUserBody,
  type UserRole,
} from "@space/shared";

import { FormScreen } from "../../design/layout/form-screen";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../design/ui";
import { FormField } from "../../design/ui/form-field";
import { Text } from "../../design/ui/text";
import { firstErrorByField } from "../../lib/form-errors";
import { USER_ROLE_LABELS as ROLE_LABELS } from "../../lib/user-role-labels";

interface UserFormValues {
  name: string;
  email: string;
  role: UserRole;
  graduationYear: string;
}

export const NEW_USER_VALUES: UserFormValues = {
  name: "",
  email: "",
  role: "STUDENT",
  graduationYear: "",
};

type Submit = { mode: "create"; body: CreateUserBody } | { mode: "edit"; body: Omit<UpdateUserBody, "confirmSuper"> };

/**
 * v1 src/components/users/user-form.tsx for create and edit (B5-4): Name,
 * Email (read-only on edit, R48), Role select, "JPCS graduation year" with its
 * alumni-only caption, then Cancel / Deactivate or Reactivate / submit.
 * Validation runs the ONE shared schema (R55: v1's form re-implemented it and
 * drifted). The SUPER-grant confirmation belongs to the screen.
 */
export function UserForm({
  mode,
  title,
  subtitle,
  initial,
  submitting,
  message,
  readOnly = false,
  onSubmit,
  children,
}: {
  mode: "create" | "edit";
  title: string;
  subtitle?: string;
  initial: UserFormValues;
  submitting: boolean;
  message: string | null;
  /**
   * Fields are disabled and Save says why (a deactivated account: the server
   * refuses every edit, REG-104).
   */
  readOnly?: boolean;
  onSubmit: (submit: Submit) => void;
  /** Rows under the fields (the edit screen's invite, deactivate and notes). */
  children?: ReactNode;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Admin and leader come from season rows: shown as text, never offered or sent.
  const fromSeasons = mode === "edit" && (initial.role === "ADMIN" || initial.role === "LEADER");
  const needsYear = ALUMNI_ONLY_ROLES.includes(v.role);
  // A student's year is their alumni status: Graduate sets it (the server's `use_graduate`).
  const studentStays = mode === "edit" && initial.role === "STUDENT" && v.role === "STUDENT";
  const yearLocked = studentStays && initial.graduationYear === "";

  const submit = () => {
    if (readOnly) return;
    const year = v.graduationYear.trim();
    if (year !== "" && !/^\d{4}$/.test(year)) {
      setErrors({ graduationYear: "Must be a year." });
      return;
    }
    const graduationYear = year === "" ? null : Number(year);
    if (mode === "create") {
      const parsed = createUserRequestSchema.safeParse({
        name: v.name,
        email: v.email.trim(),
        role: v.role,
        graduationYear,
      });
      if (!parsed.success) {
        setErrors(firstErrorByField(parsed.error));
        return;
      }
      setErrors({});
      onSubmit({ mode: "create", body: parsed.data });
      return;
    }
    const parsed = updateUserRequestSchema.safeParse({
      name: v.name,
      ...(fromSeasons ? {} : { role: v.role }),
      graduationYear,
    });
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    onSubmit({ mode: "edit", body: parsed.data });
  };

  const saveHint =
    message ??
    (readOnly
      ? "Reactivate this account to edit it."
      : Object.keys(errors).length > 0
        ? "Fix the fields marked above."
        : undefined);

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      saveLabel={mode === "create" ? "Create and send invite" : "Save changes"}
      saving={submitting}
      saveHint={saveHint}
      disabled={readOnly}
      onSave={submit}
    >
      <View className="flex-col gap-4">
        <FormField label="Name" required error={errors.name}>
          <Input
            accessibilityLabel="Name"
            disabled={readOnly}
            value={v.name}
            onChangeText={(name) => setV({ ...v, name })}
          />
        </FormField>
        {mode === "create" ? (
          <FormField label="Email" required error={errors.email}>
            <Input
              accessibilityLabel="Email"
              value={v.email}
              onChangeText={(email) => setV({ ...v, email })}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </FormField>
        ) : null}
        {fromSeasons ? (
          <FormField label="Role" description="Admin and leader come from the person's seasons.">
            <Text>{ROLE_LABELS[initial.role]}</Text>
          </FormField>
        ) : (
          <FormField label="Role" required error={errors.role}>
            <Select
              items={ROLE_LABELS}
              disabled={readOnly}
              value={v.role}
              onValueChange={(role) => setV({ ...v, role: role as UserRole })}
            >
              <SelectTrigger accessibilityLabel="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userWriteRoleSchema.options.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField
          label="JPCS graduation year"
          required={needsYear}
          description={
            yearLocked
              ? "Not graduated yet. To graduate them, use Graduate on their student page."
              : studentStays
                ? "Correct a wrong year here. Graduating can't be undone."
                : needsYear
                  ? "Leaders, admins, and mentors must be JPCS alumni."
                  : "Optional — set if this person has graduated from JPCS."
          }
          error={errors.graduationYear}
        >
          <Input
            accessibilityLabel="Graduation year"
            disabled={readOnly || yearLocked}
            value={v.graduationYear}
            onChangeText={(graduationYear) => setV({ ...v, graduationYear })}
            keyboardType="number-pad"
            placeholder="e.g. 2020"
          />
        </FormField>

        {children}
      </View>
    </FormScreen>
  );
}
