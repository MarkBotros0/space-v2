/**
 * The assignment form's pieces: a part card in each state (a video with its
 * player, first and last in the list, one needing a fix) and the reminder with
 * every form of its "when it goes out" line. Fake data; nothing saves.
 */
import { useState } from "react";
import { View } from "react-native";
import type { Reminder } from "@space/shared";

import { PillButton } from "../../design/ui/pill-button";
import { Text } from "../../design/ui/text";
import type { PartDraft } from "../../lib/assignment-form-values";
import { reminderPreview } from "../assignment-form/assignment-form-model";
import { PartCard } from "../assignment-form/part-card";
import { ONE_FORUM } from "../assignment-form/parts-tab";
import { ReminderFields } from "../assignment-form/reminder-fields";
import { CatalogueSection } from "./section";

const PARTS: PartDraft[] = [
  {
    key: "c-video",
    kind: "VIDEO",
    title: "The prodigal son, a talk",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
    blockSkipping: true,
    durationSeconds: 1080,
  },
  {
    key: "c-essay",
    kind: "ESSAY",
    prompt: "Who are you in the story, and why?",
    minWords: 150,
    maxWords: 300,
    maxFileSizeMb: 10,
    allowedMimeCategories: ["pdf"],
  },
  {
    key: "c-forum",
    kind: "FORUM",
    prompt: "Share one thing you learnt",
    minWords: 50,
    postToRead: true,
    allowComments: false,
  },
];

/** Every line the server or the preview can show. */
const LINES = [
  "Tue 11 Nov, around 9:00 AM — students who haven't finished",
  "2 days before the next session, around 9:00\u00A0AM — students who haven't finished",
  "No upcoming session yet — no reminder",
  "No due date yet — no reminder",
  "Too close to the next session — no reminder",
  "Sent Tue 11 Nov, around 9:00 AM",
  "No reminder goes out for this assignment.",
];

const noop = () => undefined;

export function AssignmentFormSection() {
  const [reminder, setReminder] = useState<Reminder>({ enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" });
  const line = reminderPreview({ reminder, dueDay: null, dueTime: "23:59" }, null, new Date());
  return (
    <CatalogueSection id="assignment-form" title="Assignment form">
      <Text variant="subhead" className="text-muted-foreground">
        Part cards: a video shows its player; Move up is off on the first, Move down on the last.
      </Text>
      {PARTS.map((part, index) => (
        <PartCard
          key={part.key}
          part={part}
          index={index}
          count={PARTS.length}
          error={part.kind === "FORUM" ? "Write the prompt" : undefined}
          onEdit={noop}
          onMove={noop}
          onRemove={noop}
        />
      ))}
      <View className="flex-row flex-wrap items-center gap-2">
        <PillButton label="+ Video" onPress={noop} />
        <PillButton label="+ Essay question" onPress={noop} />
        <PillButton label="+ Forum" disabled onPress={noop} />
      </View>
      <Text variant="caption" className="text-muted-foreground">
        {ONE_FORUM}
      </Text>
      <Text variant="headline" className="text-foreground">
        Reminder
      </Text>
      <ReminderFields reminder={reminder} hasDueDate={false} line={line} errors={{}} onChange={setReminder} />
      <Text variant="subhead" className="text-muted-foreground">
        Every form of the line:
      </Text>
      {LINES.map((l) => (
        <Text key={l} variant="subhead" className="text-foreground">
          {l}
        </Text>
      ))}
    </CatalogueSection>
  );
}
