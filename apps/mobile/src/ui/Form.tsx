import { Controller } from "react-hook-form";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { Input } from "./Input";
import type { InputProps } from "./Input";

export interface FormFieldProps<TFieldValues extends FieldValues>
  extends Omit<InputProps, "value" | "onChangeText" | "error" | "label"> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
}

/**
 * Binds a react-hook-form `Controller` to the `Input` primitive: the
 * resolver (typically `zodResolver` over a `@space/shared` schema) drives
 * validation, and its message becomes the field's visible/announced error.
 * Every write screen in the app is a form over a shared Zod schema — this is
 * the one place that wiring lives, instead of each screen improvising it.
 */
export function FormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  ...rest
}: FormFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Input
          {...rest}
          label={label}
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
        />
      )}
    />
  );
}
