// apps/mobile/src/lib/google-sign-in.ts
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { googleSignInIds } from "./app-config";

/** Thrown when this build has no Google client IDs, or the device can't sign in with Google. */
export class GoogleSignInUnavailableError extends Error {}

let configured = false;

/** True when this build can offer Google sign-in at all. */
export function isGoogleSignInConfigured(): boolean {
  return googleSignInIds() !== null;
}

/**
 * Opens Google's account sheet and returns the ID token for our backend, or
 * null when the person closed it. We keep no Google session of our own: the
 * backend issues ours, so Google is signed out at once and the next sign-in
 * asks which account again.
 */
export async function googleIdToken(): Promise<string | null> {
  const ids = googleSignInIds();
  if (!ids)
    throw new GoogleSignInUnavailableError("Google sign-in isn't configured in this build.");
  if (!configured) {
    GoogleSignin.configure({
      webClientId: ids.webClientId,
      ...(ids.iosClientId ? { iosClientId: ids.iosClientId } : {}),
    });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== "success") return null;
    const idToken = response.data.idToken;
    await GoogleSignin.signOut().catch(() => undefined);
    if (!idToken) throw new Error("Google returned no ID token");
    return idToken;
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS)
        return null;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleSignInUnavailableError(
          "Google Play services aren't available on this phone.",
        );
      }
    }
    throw err;
  }
}
