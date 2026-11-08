import type { AnnouncementListItem } from "@space/shared";
import { View } from "react-native";

import { Text } from "../../design/ui/text";
import { AnnouncementsHomeCardView } from "../announcements/announcements-home-card";
import { AudienceChip } from "../announcements/audience-chip";
import { PostCard } from "../announcements/post-card";
import { CatalogueSection } from "./section";

const noop = () => {};

const community: AnnouncementListItem = {
  id: 1,
  audience: "COMMUNITY",
  seasonId: null,
  seasonTitle: null,
  excerpt: "Registration for the next season opens on Friday. Please read the details and tell us if anything is unclear.",
  authorName: "Mina Adel",
  createdAt: "2026-11-03T09:00:00.000Z",
  editedAt: null,
  isRead: false,
};
const season: AnnouncementListItem = {
  ...community,
  id: 2,
  audience: "SEASON",
  seasonId: 3,
  seasonTitle: "GBV 2026",
  excerpt: "This week's session is in the main hall, not the classroom.",
  authorName: "Sara Nabil",
  editedAt: "2026-11-04T10:00:00.000Z",
  isRead: true,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text variant="caption" className="text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Announcements: the post card (unread, read), the audience chip and Home's card (one unread, several). Fixed data, no network. */
export function AnnouncementsSection() {
  return (
    <CatalogueSection id="announcements" title="Announcements">
      <Row label="Audience chip">
        <View className="flex-row flex-wrap gap-2">
          <AudienceChip audience="COMMUNITY" seasonTitle={null} />
          <AudienceChip audience="SEASON" seasonTitle="GBV 2026" />
        </View>
      </Row>
      <Row label="Post card, unread">
        <PostCard post={community} onPress={noop} />
      </Row>
      <Row label="Post card, read, edited">
        <PostCard post={season} onPress={noop} />
      </Row>
      <Row label="Home card, one unread">
        <AnnouncementsHomeCardView count={1} latest={community} />
      </Row>
      <Row label="Home card, three unread">
        <AnnouncementsHomeCardView count={3} latest={season} />
      </Row>
    </CatalogueSection>
  );
}
