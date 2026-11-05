import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  OWN_PROFILE_FIELDS,
  updateOwnProfileInputSchema,
  type MyProfile,
  type OwnProfileField,
  type UpdateOwnProfileInput,
} from "@space/shared";

import { format, isValid, parse } from "date-fns";

import { Fieldset } from "../../design/forms/fieldset";
import {
  DatePicker,
  FormField,
  Input as InputV1,
  Text as TextV1,
  Textarea,
  toast,
} from "../../design/ui";
import { useUpdateStudentProfile } from "../../hooks/use-self-service";
import { apiErrorMessage } from "../../lib/api-error";

type FormValues = Record<OwnProfileField, string>;

function toFormValues(p: MyProfile): FormValues {
  return {
    university: p.university ?? "",
    year: p.year ?? "",
    phone: p.phone ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    spiritualBackground: p.spiritualBackground ?? "",
    gifts: p.gifts ?? "",
  };
}

function isOwnProfileField(key: string): key is OwnProfileField {
  return OWN_PROFILE_FIELDS.some((field) => field === key);
}

/** "2001-04-05" ↔ a local-midnight Date: no zone shift either way. */
function dobToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : null;
}

/**
 * v1 student-form.tsx in its isSelf mode — the six own columns (Decision 1).
 * The fields and the save action are returned apart, so the screen can pin
 * Save in `FormScreen`'s footer instead of leaving it below the long form.
 */
export function useProfileForm(profile: MyProfile): {
  fields: ReactNode;
  save: () => void;
  saving: boolean;
  /** True while the fields differ from what is saved; Save is enabled only then. */
  dirty: boolean;
} {
  const update = useUpdateStudentProfile();
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  // What the server holds: the opening values, then whatever the last save landed.
  const [saved, setSaved] = useState<FormValues>(() => toFormValues(profile));
  const dirty = OWN_PROFILE_FIELDS.some((field) => values[field] !== saved[field]);
  const [errors, setErrors] = useState<Partial<Record<OwnProfileField, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const set = (field: OwnProfileField) => (text: string) =>
    setValues((v) => ({ ...v, [field]: text }));

  const save = () => {
    setSubmitError(null);
    const body: UpdateOwnProfileInput = values;
    // The SAME schema the server runs — v1's client and server copies had
    // drifted (spec 06 R21); here they cannot.
    const parsed = updateOwnProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<OwnProfileField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && isOwnProfileField(key) && next[key] === undefined) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const sent = values;
    update.mutate(body, {
      onSuccess: () => {
        setSaved(sent);
        toast.success("Profile saved.");
      },
      onError: (err) => setSubmitError(apiErrorMessage(err, "Couldn't save your profile.")),
    });
  };

  const fields = (
    <View className="flex-col gap-6">
      <Fieldset legend="Personal">
        <FormField label="Date of birth" error={errors.dateOfBirth}>
          <DatePicker
            accessibilityLabel="Date of birth"
            value={dobToDate(values.dateOfBirth)}
            onChange={(d) => set("dateOfBirth")(format(d, "yyyy-MM-dd"))}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Contact">
        <FormField label="Phone" error={errors.phone}>
          <InputV1
            accessibilityLabel="Phone"
            keyboardType="phone-pad"
            value={values.phone}
            onChangeText={set("phone")}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Academic">
        <FormField label="University" error={errors.university}>
          <InputV1
            accessibilityLabel="University"
            value={values.university}
            onChangeText={set("university")}
          />
        </FormField>
        <FormField label="Year / faculty" error={errors.year}>
          <InputV1
            accessibilityLabel="Year / faculty"
            placeholder="e.g. 3rd · Engineering"
            value={values.year}
            onChangeText={set("year")}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Spiritual background">
        <FormField label="Notes" error={errors.spiritualBackground}>
          <Textarea
            accessibilityLabel="Notes"
            numberOfLines={3}
            placeholder="Church affiliation, baptism status, faith journey…"
            value={values.spiritualBackground}
            onChangeText={set("spiritualBackground")}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Community">
        <FormField label="Gifts / interests" error={errors.gifts}>
          <Textarea
            accessibilityLabel="Gifts / interests"
            numberOfLines={2}
            placeholder="e.g. worship, hospitality, mentoring younger students"
            value={values.gifts}
            onChangeText={set("gifts")}
          />
        </FormField>
      </Fieldset>
      {submitError ? (
        <TextV1
          accessibilityLiveRegion="polite"
          className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad"
        >
          {submitError}
        </TextV1>
      ) : null}
    </View>
  );
  return { fields, save, saving: update.isPending, dirty };
}
