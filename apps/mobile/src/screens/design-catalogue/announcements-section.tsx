import type { AnnouncementListItem, AnnouncementPoll, PollVotersResponse } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { Text } from "../../design/ui/text";
import { AnnouncementsHomeCardView } from "../announcements/announcements-home-card";
import { AudienceChip } from "../announcements/audience-chip";
import { ConfirmEditSheet } from "../announcements/confirm-edit-sheet";
import { PollEditor, type PollErrors } from "../announcements/poll/poll-editor";
import { PollCard } from "../announcements/poll/poll-card";
import { VotersSheetView } from "../announcements/poll/voters-sheet";
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
  hasPoll: false,
  pollClosed: null,
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

const pollBase: AnnouncementPoll = {
  version: 1,
  allowsMultiple: false,
  closed: false,
  canVote: true,
  canManage: false,
  canSeeNames: false,
  myOptionIds: [],
  voterCount: null,
  multiPickVoters: null,
  multiPickVotes: null,
  options: [
    { id: 1, label: "Thursday", votes: null },
    { id: 2, label: "Friday", votes: null },
    { id: 3, label: "Saturday", votes: null },
  ],
};
const votedOne: AnnouncementPoll = {
  ...pollBase,
  myOptionIds: [2],
  voterCount: 5,
  options: [
    { id: 1, label: "Thursday", votes: 1 },
    { id: 2, label: "Friday", votes: 3 },
    { id: 3, label: "Saturday", votes: 1 },
  ],
};
const votedSeveral: AnnouncementPoll = {
  ...votedOne,
  allowsMultiple: true,
  myOptionIds: [1, 2],
  options: [
    { id: 1, label: "Thursday", votes: 3 },
    { id: 2, label: "Friday", votes: 4 },
    { id: 3, label: "Saturday", votes: 1 },
  ],
};
const closedPoll: AnnouncementPoll = { ...votedOne, closed: true, canVote: false };
const managerPoll: AnnouncementPoll = {
  ...votedOne,
  canManage: true,
  canSeeNames: true,
  myOptionIds: [],
  multiPickVoters: 0,
  multiPickVotes: 0,
};
const voters: PollVotersResponse = {
  options: [
    { id: 1, label: "Thursday", voters: [{ name: "Mina Adel" }] },
    { id: 2, label: "Friday", voters: [{ name: "Sara Nabil" }, { name: null }, { name: "Karim Fawzy" }] },
    { id: 3, label: "Saturday", voters: [] },
  ],
};
const editLines = [
  "Removing ‘Saturday’ deletes its 1 vote",
  "Votes stay with the new wording: ‘Friday’ → ‘Friday evening’ (3 votes)",
];
type OpenSheet = "voters" | "edit" | "edit-new-votes" | null;
const noErrors: PollErrors = {};
const editorValue = { allowsMultiple: true, options: [{ label: "Thursday" }, { label: "" }] };
const pollPost: AnnouncementListItem = { ...season, id: 4, excerpt: "Which evening suits the retreat?", hasPoll: true, pollClosed: false };

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

/** Announcements: the post card (unread, read, poll), the audience chip, the poll card in each state, its editor, the who-voted and edit-warning sheets, and Home's card. Fixed data, no network. */
export function AnnouncementsSection() {
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const close = () => setSheet(null);
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
      <Row label="Post card, with a poll">
        <PostCard post={pollPost} onPress={noop} />
      </Row>
      <Row label="Post card, poll closed">
        <PostCard post={{ ...pollPost, id: 5, pollClosed: true }} onPress={noop} />
      </Row>
      <Row label="Poll, to vote">
        <PollCard postId={4} poll={pollBase} />
      </Row>
      <Row label="Poll, voted one">
        <PollCard postId={4} poll={votedOne} />
      </Row>
      <Row label="Poll, voted several">
        <PollCard postId={4} poll={votedSeveral} />
      </Row>
      <Row label="Poll, closed">
        <PollCard postId={4} poll={closedPoll} />
      </Row>
      <Row label="Poll, manager">
        <PollCard postId={4} poll={managerPoll} />
      </Row>
      <Row label="Poll editor">
        <PollEditor value={editorValue} onChange={noop} onRemove={noop} errors={noErrors} />
      </Row>
      <Row label="Poll sheets (they only close)">
        <View className="flex-row flex-wrap gap-2">
          <Button testID="catalogue-open-voters" variant="secondary" onPress={() => setSheet("voters")}>
            Who voted
          </Button>
          <Button testID="catalogue-open-edit-warning" variant="secondary" onPress={() => setSheet("edit")}>
            Edit warning
          </Button>
          <Button testID="catalogue-open-edit-new-votes" variant="secondary" onPress={() => setSheet("edit-new-votes")}>
            New votes came in
          </Button>
        </View>
      </Row>
      <VotersSheetView
        open={sheet === "voters"}
        onClose={close}
        pending={false}
        failed={false}
        data={voters}
        onRetry={noop}
      />
      <ConfirmEditSheet
        open={sheet === "edit" || sheet === "edit-new-votes"}
        lines={editLines}
        serverLostVotes={sheet === "edit-new-votes" ? 4 : null}
        pending={false}
        onConfirm={close}
        onClose={close}
      />
    </CatalogueSection>
  );
}
