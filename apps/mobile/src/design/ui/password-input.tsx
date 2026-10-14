/**
 * Port of v1 src/components/ui/password-input.tsx — same labels and padding.
 * Native differences: type=password → secureTextEntry.
 */
import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { Pressable, type TextInput, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Input, type InputProps } from "./input";

iconWithClassName(Eye, EyeOff);

const PasswordInput = forwardRef<TextInput, Omit<InputProps, "secureTextEntry">>(({ className, size, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  const padding = size === "sm" ? "pr-8" : size === "lg" ? "pr-11" : "pr-10";
  return (
    <View className="relative">
      <Input ref={ref} secureTextEntry={!visible} size={size} className={cn(padding, className)} {...props} />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        accessibilityState={{ selected: visible }}
        className="absolute inset-y-0 right-0 items-center justify-center px-3"
      >
        <Icon size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
