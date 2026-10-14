/**
 * Port of v1 src/components/ui/form-field.tsx.
 * Native differences: the error also reaches the control as its
 * accessibilityHint (the app's convention for announcing field errors).
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { Field, FieldDescription, FieldError } from "./field";
import { Label } from "./label";
import { Text } from "./text";

function FormField({
  label,
  description,
  error,
  required,
  className,
  children,
}: {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const control = Children.map(children, (child) =>
    error && isValidElement(child)
      ? cloneElement(child as ReactElement<{ accessibilityHint?: string; "aria-invalid"?: boolean }>, {
          accessibilityHint: error,
          "aria-invalid": true,
        })
      : child,
  );
  return (
    <Field className={cn("flex-col gap-1.5", className)}>
      {label ? (
        <Label>
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Label>
      ) : null}
      {control}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export { FormField };
