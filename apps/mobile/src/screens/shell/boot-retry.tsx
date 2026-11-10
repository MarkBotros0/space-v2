import { RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { bootSession, signOutOfBoot } from "../../hooks/use-session";

/**
 * Cold start with a stored session the server couldn't confirm or refuse (rate
 * limited, say). Nothing has been signed out, so this offers another look first.
 * Sign out is the way out when it keeps failing: a retry can't fix a refresh that
 * always errors, and the iOS keychain survives a reinstall.
 */
export function BootRetry() {
  const [signingOut, setSigningOut] = useState(false);
  const signOut = () => {
    setSigningOut(true);
    void signOutOfBoot();
  };
  return (
    <View className="flex-1 items-center justify-center bg-background px-4">
      <EmptyState
        icon={RefreshCw}
        title="Couldn't check your sign-in"
        description="Please try again in a moment."
        action={
          <View className="flex-col items-center gap-2">
            <Button variant="secondary" disabled={signingOut} onPress={() => void bootSession()}>
              Try again
            </Button>
            <Button variant="plain" disabled={signingOut} onPress={signOut}>
              Sign out
            </Button>
          </View>
        }
      />
    </View>
  );
}
