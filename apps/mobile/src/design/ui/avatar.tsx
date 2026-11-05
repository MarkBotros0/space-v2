/**
 * Port of v1 src/components/ui/avatar.tsx (Base UI Avatar).
 * Native differences: Base UI's load tracking is a small context — the
 * fallback shows until AvatarImage reports onLoad, and again on onError;
 * text size classes move from the root to the fallback Text;
 * AvatarGroup ring-2 ring-white → border-2 border-background (the page, in
 * either theme), -space-x-2 → -ml-2.
 * Dark mode: a deep teal disc (teal-900) with teal-50 initials, 8.3:1; v1's
 * pale mint disc stayed a hard-coded light surface on the dark page.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { Children, createContext, type ReactNode, useContext, useState } from "react";
import { Image, type ImageSourcePropType, View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

const avatarVariants = cva(
  "relative shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-teal-100 dark:bg-brand-teal-900",
  {
    variants: { size: { sm: "size-7", md: "size-10", lg: "size-12", xl: "size-16" } },
    defaultVariants: { size: "md" },
  },
);

const avatarTextVariants = cva("font-semibold text-brand-navy-900 dark:text-brand-teal-50", {
  variants: { size: { sm: "text-xs", md: "text-sm", lg: "text-base", xl: "text-lg" } },
  defaultVariants: { size: "md" },
});

type Size = NonNullable<VariantProps<typeof avatarVariants>["size"]>;
const AvatarContext = createContext<{
  size: Size;
  loaded: boolean;
  setLoaded: (v: boolean) => void;
}>({
  size: "md",
  loaded: false,
  setLoaded: () => {},
});

function Avatar({
  className,
  size = "md",
  children,
  testID,
}: VariantProps<typeof avatarVariants> & {
  className?: string;
  children?: ReactNode;
  testID?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const resolved = size ?? "md";
  return (
    <AvatarContext.Provider value={{ size: resolved, loaded, setLoaded }}>
      <View testID={testID} className={cn(avatarVariants({ size: resolved }), className)}>
        {children}
      </View>
    </AvatarContext.Provider>
  );
}

function AvatarImage({
  className,
  src,
  alt,
}: {
  className?: string;
  src?: string | ImageSourcePropType | null;
  alt?: string;
}) {
  const { loaded, setLoaded } = useContext(AvatarContext);
  if (!src) return null;
  return (
    <Image
      source={typeof src === "string" ? { uri: src } : src}
      accessibilityLabel={alt}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
      resizeMode="cover"
      className={cn("absolute inset-0 size-full", !loaded && "opacity-0", className)}
    />
  );
}

function AvatarFallback({ className, children }: { className?: string; children?: ReactNode }) {
  const { size, loaded } = useContext(AvatarContext);
  if (loaded) return null;
  return (
    <View className="items-center justify-center">
      <Text numberOfLines={1} className={cn(avatarTextVariants({ size }), className)}>
        {children}
      </Text>
    </View>
  );
}

function AvatarGroup({
  className,
  children,
  max,
}: {
  className?: string;
  children?: ReactNode;
  max?: number;
}) {
  const all = Children.toArray(children);
  const visible = max ? all.slice(0, max) : all;
  const overflow = max ? all.length - visible.length : 0;
  return (
    <View className={cn("flex-row", className)}>
      {visible.map((child, i) => (
        <View key={i} className={cn("rounded-full border-2 border-background", i > 0 && "-ml-2")}>
          {child}
        </View>
      ))}
      {overflow > 0 ? (
        <View className="-ml-2 rounded-full border-2 border-background">
          <Avatar size="md">
            <AvatarFallback>+{overflow}</AvatarFallback>
          </Avatar>
        </View>
      ) : null}
    </View>
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, avatarVariants };
