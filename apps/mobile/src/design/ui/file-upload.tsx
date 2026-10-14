/**
 * Port of v1 src/components/ui/file-upload.tsx — visual port: dropzone,
 * copy, size line, error and file rows as v1 draws them.
 * Native differences: no drag and drop or <input type=file>; pressing the
 * zone calls onPress so a screen can open a picker (uploads are off,
 * ENABLE_UPLOADS=false); the file list and error are props.
 */
import { UploadCloud, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Text } from "./text";

iconWithClassName(UploadCloud, X);

function FileUpload({
  accept,
  maxSizeMb,
  files = [],
  error,
  onPress,
  onRemove,
  className,
}: {
  accept?: string;
  maxSizeMb?: number;
  files?: { name: string; size: number }[];
  error?: string | null;
  onPress?: () => void;
  onRemove?: (index: number) => void;
  className?: string;
}) {
  return (
    <View className={cn("flex-col gap-2", className)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upload a file"
        onPress={onPress}
        className={cn(
          "flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8",
          error
            ? "border-error-500 bg-error-50 dark:bg-error-950/40"
            : "border-border bg-muted/40 active:border-brand-teal-400 active:bg-brand-teal-50/50 dark:active:bg-brand-teal-950/30",
        )}
      >
        <UploadCloud size={32} className="text-muted-foreground" />
        <View className="flex-col items-center gap-0.5">
          <Text className="text-center text-sm font-medium text-foreground">
            <Text className="font-medium text-brand-teal-600 dark:text-brand-teal-400">Click to upload</Text> or drag and drop
          </Text>
          {maxSizeMb ? (
            <Text className="text-xs text-muted-foreground">
              Up to {maxSizeMb} MB{accept ? ` · ${accept}` : ""}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {error ? <Text className="text-xs text-error-600">{error}</Text> : null}
      {files.length > 0 ? (
        <View className="flex-col gap-1.5">
          {files.map((f, i) => (
            <View key={`${f.name}-${i}`} className="flex-row items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
              <Text numberOfLines={1} className="shrink text-sm text-foreground">
                {f.name}
              </Text>
              <Text className="shrink-0 text-xs text-muted-foreground tabular-nums">{(f.size / 1024).toFixed(1)} KB</Text>
              <Button variant="ghost" size="icon-xs" accessibilityLabel={`Remove ${f.name}`} onPress={() => onRemove?.(i)}>
                <X size={12} className="text-foreground" />
              </Button>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export { FileUpload };
