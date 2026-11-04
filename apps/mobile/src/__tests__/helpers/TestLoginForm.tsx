import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control } from "react-hook-form";
import type { z } from "zod";

import { Button } from "../../design/ui/button";
import { FormField } from "../../design/ui/form-field";
import { Input } from "../../design/ui/input";

interface TestLoginFormValues {
  email: string;
  password: string;
}

interface TestLoginFormProps {
  schema: z.ZodType<TestLoginFormValues, TestLoginFormValues>;
  onSubmit: (values: TestLoginFormValues) => void;
}

/** The app's form wiring: a Controller around FormField + Input, the error passed to FormField. */
function Field({
  control,
  name,
  label,
  secureTextEntry,
}: {
  control: Control<TestLoginFormValues>;
  name: keyof TestLoginFormValues;
  label: string;
  secureTextEntry?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} error={fieldState.error?.message}>
          <Input
            accessibilityLabel={label}
            secureTextEntry={secureTextEntry}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
          />
        </FormField>
      )}
    />
  );
}

/**
 * Minimal harness over the design kit's FormField — the point of
 * `form.test.tsx` is proving the react-hook-form + zodResolver + FormField
 * wiring, not the login screen itself (that's `login-screen.test.tsx`).
 */
export function TestLoginForm({ schema, onSubmit }: TestLoginFormProps) {
  const { control, handleSubmit } = useForm<TestLoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <>
      <Field control={control} name="email" label="Email" />
      <Field control={control} name="password" label="Password" secureTextEntry />
      {/* Wrapped so onSubmit gets exactly the parsed values, never a press event. */}
      <Button onPress={() => void handleSubmit((values) => onSubmit(values))()}>Sign in</Button>
    </>
  );
}
