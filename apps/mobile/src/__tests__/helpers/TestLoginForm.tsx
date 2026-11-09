import { useState } from "react";
import type { z } from "zod";

import { Button } from "../../design/ui/button";
import { FormField } from "../../design/ui/form-field";
import { Input } from "../../design/ui/input";
import { useSchemaErrors } from "../../lib/form-errors";

interface TestLoginFormValues {
  email: string;
  password: string;
}

interface TestLoginFormProps {
  schema: z.ZodType<TestLoginFormValues, TestLoginFormValues>;
  onSubmit: (values: TestLoginFormValues) => void;
}

/**
 * Minimal harness over the design kit's FormField — the point of
 * `form.test.tsx` is proving the useSchemaErrors + FormField wiring (the
 * schema's message reaches the field), not the login screen itself (that's
 * `login-screen.test.tsx`).
 */
export function TestLoginForm({ schema, onSubmit }: TestLoginFormProps) {
  const [values, setValues] = useState<TestLoginFormValues>({ email: "", password: "" });
  const { errors, validate } = useSchemaErrors(schema);
  const field = (name: keyof TestLoginFormValues, label: string, secureTextEntry?: boolean) => (
    <FormField label={label} error={errors[name]}>
      <Input
        accessibilityLabel={label}
        secureTextEntry={secureTextEntry}
        value={values[name]}
        onChangeText={(text) => setValues((v) => ({ ...v, [name]: text }))}
      />
    </FormField>
  );

  return (
    <>
      {field("email", "Email")}
      {field("password", "Password", true)}
      <Button onPress={() => (validate(values) ? onSubmit(values) : undefined)}>Sign in</Button>
    </>
  );
}
