import { Redirect } from "expo-router";

/**
 * An unknown deep link (`spacev2://anything`) goes home instead of
 * expo-router's "Unmatched Route" page, whose sitemap link lists every route.
 * `/` sends the user on to the dashboard or the login screen.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
