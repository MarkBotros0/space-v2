import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { updateProfileRequestSchema, type MeUser, type UpdateProfileBody } from "@space/shared";
import { useQueryClient } from "@tanstack/react-query";
import { format, isValid, parse } from "date-fns";

import { DatePicker, FormField, Input, Textarea } from "../../design/ui";
import { useUpdateProfile } from "../../hooks/use-me";
import { queryKeys } from "../../lib/query-keys";

type Field = "name" | "phone" | "dateOfBirth" | "address";
type Values = Record<Field, string>;
const FIELDS: Field[] = ["name", "phone", "dateOfBirth", "address"];

function valuesOf(user: MeUser): Values {
  return {
    name: user.name,
    phone: user.phone ?? "",
    dateOfBirth: user.dateOfBirth ?? "",
    address: user.address ?? "",
  };
}

/** "2001-04-05" ↔ a local-midnight Date: no zone shift either way. */
function dayToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : null;
}

/**
 * Name, phone, date of birth and address: `User` columns every role edits
 * (owner, 2026-11-06), saved with PATCH /me sending only what changed ("" clears
 * a contact field). Email is staff-managed, so it is shown read-only. The
 * screen owns the one Save: `validate` shows the errors and returns the body (or
 * null), `commit` sends it and throws on failure.
 */
export function usePersonalForm(user: MeUser): {
  fields: ReactNode;
  dirty: boolean;
  validate: () => UpdateProfileBody | null;
  commit: (body: UpdateProfileBody) => Promise<void>;
  saving: boolean;
} {
  const update = useUpdateProfile();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>(() => valuesOf(user));
  const [saved, setSaved] = useState<Values>(() => valuesOf(user));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (field: Field) => (text: string) => setValues((v) => ({ ...v, [field]: text }));

  const changed = FIELDS.filter((f) => values[f].trim() !== saved[f].trim());

  const validate = () => {
    const body: UpdateProfileBody = {};
    for (const f of changed) body[f] = values[f];
    // The same schema the server runs.
    const parsed = updateProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && (FIELDS as string[]).includes(key))
          next[key as Field] ??= issue.message;
      }
      setErrors(next);
      return null;
    }
    setErrors({});
    return body;
  };

  const commit = async (body: UpdateProfileBody) => {
    const next = await update.mutateAsync(body);
    setValues(valuesOf(next));
    setSaved(valuesOf(next));
    // A student's own record repeats phone and date of birth.
    void queryClient.invalidateQueries({ queryKey: queryKeys.me.profile() });
  };

  const fields = (
    <View className="flex-col gap-4">
      <FormField label="Name" required error={errors.name}>
        <Input
          accessibilityLabel="Name"
          autoComplete="name"
          value={values.name}
          onChangeText={set("name")}
        />
      </FormField>
      <FormField label="Email" description="To change your email, contact the JPC team.">
        <Input accessibilityLabel="Email" value={user.email} readOnly />
      </FormField>
      <FormField label="Phone" description="11 digits, starting with 01." error={errors.phone}>
        <Input
          accessibilityLabel="Phone"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={values.phone}
          onChangeText={set("phone")}
        />
      </FormField>
      <FormField label="Date of birth" error={errors.dateOfBirth}>
        <DatePicker
          accessibilityLabel="Date of birth"
          startWith="year"
          value={dayToDate(values.dateOfBirth)}
          onChange={(d) => set("dateOfBirth")(format(d, "yyyy-MM-dd"))}
        />
      </FormField>
      <FormField label="Address" error={errors.address}>
        <Textarea
          accessibilityLabel="Address"
          autoComplete="street-address"
          placeholder="Street, area, city"
          value={values.address}
          onChangeText={set("address")}
        />
      </FormField>
    </View>
  );

  return { fields, dirty: changed.length > 0, validate, commit, saving: update.isPending };
}
