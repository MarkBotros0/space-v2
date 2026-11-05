import { NAV_ICONS } from "../../design/icons/nav-icon";
import { Screen } from "../../design/layout/screen";
import { EmptyState } from "../../design/ui";

/** What every ADMIN / SUPER-only list shows to anyone else. */
export function NotAvailable({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <EmptyState icon={NAV_ICONS.submissions} title={title} description="This screen isn't available for your role." />
    </Screen>
  );
}
