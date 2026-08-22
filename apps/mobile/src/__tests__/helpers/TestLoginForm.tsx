import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "../../ui/Button";
import { FormField } from "../../ui/Form";

interface TestLoginFormValues {
  email: string;
  password: string;
}

interface TestLoginFormProps {
  schema: z.ZodType<TestLoginFormValues>;
  onSubmit: (values: TestLoginFormValues) => void;
}

/**
 * Minimal harness over `FormField` — the point of `form.test.tsx` is proving
 * the react-hook-form + zodResolver + Input wiring, not the login screen
 * itself (that's `login-screen.test.tsx`).
 */
export function TestLoginForm({ schema, onSubmit }: TestLoginFormProps) {
  const { control, handleSubmit } = useForm<TestLoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <>
      <FormField control={control} name="email" label="Email" />
      <FormField control={control} name="password" label="Password" secureTextEntry />
      {/*
       * react-hook-form's `handleSubmit(fn)` always invokes `fn(values, event)`
       * — even when called with no native event (as `Button`'s `onPress` does,
       * since its signature is `() => void`), `event` comes through as
       * `undefined`. Wrapping so `onSubmit` is called with exactly the parsed
       * values, not `(values, undefined)`.
       */}
      <Button title="Sign in" onPress={handleSubmit((values) => onSubmit(values))} />
    </>
  );
}
