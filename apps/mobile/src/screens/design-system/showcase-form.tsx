/** v1 src/app/dev/design-system/form.tsx: the React Hook Form + Zod demo. */
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../../design/ui";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["ADMIN", "LEADER", "MENTOR", "STUDENT"]),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function DesignSystemForm() {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", role: "STUDENT", notes: "" },
  });
  const onSubmit = async () => {
    await new Promise((r) => setTimeout(r, 600));
  };
  return (
    <View className="gap-4">
      <Field>
        <Label>Name</Label>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Jane Doe"
              aria-invalid={errors.name ? true : undefined}
            />
          )}
        />
        <FieldError>{errors.name?.message}</FieldError>
      </Field>
      <Field>
        <Label>Email</Label>
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="jane@example.com"
              aria-invalid={errors.email ? true : undefined}
            />
          )}
        />
        <FieldDescription>We never share your email.</FieldDescription>
        <FieldError>{errors.email?.message}</FieldError>
      </Field>
      <Field>
        <Label>Role</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => field.onChange(v as FormValues["role"])}
            >
              <SelectTrigger accessibilityLabel="Role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="LEADER">Leader</SelectItem>
                <SelectItem value="MENTOR">Mentor</SelectItem>
                <SelectItem value="STUDENT">Student</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <FieldError>{errors.role?.message}</FieldError>
      </Field>
      <Field>
        <Label>Notes</Label>
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Textarea
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Optional notes…"
              aria-invalid={errors.notes ? true : undefined}
            />
          )}
        />
        <FieldError>{errors.notes?.message}</FieldError>
      </Field>
      <View className="flex-row justify-end gap-2">
        <Button variant="ghost">Cancel</Button>
        <Button onPress={handleSubmit(onSubmit)} disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </View>
    </View>
  );
}
