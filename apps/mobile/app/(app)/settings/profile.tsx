import { useState } from "react";
import { View } from "react-native";
import { updateProfileRequestSchema, type MeUser, type UpdateProfileBody } from "@space/shared";
import { format, isValid, parse } from "date-fns";

import { FormScreen } from "../../../src/design/layout/form-screen";
import { DatePicker, FormField, Input, Textarea, toast } from "../../../src/design/ui";
import { useUpdateProfile } from "../../../src/hooks/use-me";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";

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
 * Settings → Profile details: name, phone, date of birth and address, for
 * every role (owner, 2026-11-06 — they live on User). PATCH /me with only the
 * fields that changed; "" clears a contact field. Email is staff-managed.
 */
export default function ProfileDetailsScreen() {
  const user = useSessionStore((s) => s.user);
  if (!user) return null; // the (app) layout redirects before this renders
  return <ProfileDetailsForm user={user} />;
}

function ProfileDetailsForm({ user }: { user: MeUser }) {
  const update = useUpdateProfile();
  const [values, setValues] = useState<Values>(() => valuesOf(user));
  const [saved, setSaved] = useState<Values>(() => valuesOf(user));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (field: Field) => (text: string) => setValues((v) => ({ ...v, [field]: text }));

  const changed = FIELDS.filter((f) => values[f].trim() !== saved[f].trim());

  const save = () => {
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
      return;
    }
    setErrors({});
    update.mutate(body, {
      onSuccess: (next) => {
        setValues(valuesOf(next));
        setSaved(valuesOf(next));
        toast.success("Profile saved.");
      },
      onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save. Try again.")),
    });
  };

  return (
    <FormScreen
      title="Profile details"
      saveLabel={update.isPending ? "Saving…" : "Save changes"}
      onSave={save}
      saving={update.isPending}
      saveDisabled={changed.length === 0}
    >
      <View className="flex-col gap-4 rounded-group bg-surface p-4">
        <FormField label="Name" required error={errors.name}>
          <Input
            accessibilityLabel="Name"
            autoComplete="name"
            value={values.name}
            onChangeText={set("name")}
          />
        </FormField>
        <FormField label="Email" description="Ask an admin to change this.">
          <Input accessibilityLabel="Email" value={user.email} readOnly />
        </FormField>
        <FormField label="Phone" error={errors.phone}>
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
    </FormScreen>
  );
}
