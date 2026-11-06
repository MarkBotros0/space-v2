import { RefreshCw } from "lucide-react-native";
import { View } from "react-native";

import { EmptyState } from "../design/ui/empty-state";
import { bootSession } from "../hooks/use-session";

/**
 * Cold start with a stored session the server couldn't confirm or refuse (rate
 * limited, say). Nothing has been signed out, so this offers another look rather
 * than the sign-in screen.
 */
export function BootRetry() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-4">
      <EmptyState
        icon={RefreshCw}
        title="Couldn't check your sign-in"
        description="Please try again in a moment."
        action={{ label: "Try again", onPress: () => void bootSession() }}
      />
    </View>
  );
}
