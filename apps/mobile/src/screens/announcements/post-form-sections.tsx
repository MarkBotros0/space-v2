/** The post form's audience and message (refactor FE-080). */
import { ANNOUNCEMENT_BODY_MAX, announcementPlainText, type AnnouncementTargetsResponse } from "@space/shared";

import {
  FormField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "../../design/ui";
import { RichTextEditor } from "../../design/ui/rich-text-editor";

/** The counter shows once the message is this long. */
const COUNTER_FROM = 4000;
const AUDIENCE_OPTIONS = [
  { value: "COMMUNITY", label: "Everyone" },
  { value: "SEASON", label: "A season" },
];

export type Audience = "COMMUNITY" | "SEASON";

/** Everyone or a season when both are open to the author, the season when there are several, else who it goes to. */
export function AudienceSection({
  canChoose,
  audience,
  setAudience,
  pickSeason,
  seasons,
  seasonId,
  setSeasonId,
  seasonError,
  toLabel,
}: {
  canChoose: boolean;
  audience: Audience;
  setAudience: (a: Audience) => void;
  pickSeason: boolean;
  seasons: AnnouncementTargetsResponse["seasons"];
  seasonId: number | null;
  setSeasonId: (id: number) => void;
  seasonError?: string;
  toLabel: string;
}) {
  return (
    <>
      {canChoose ? (
        <SegmentedControl options={AUDIENCE_OPTIONS} value={audience} onChange={(v) => setAudience(v as Audience)} />
      ) : null}
      {pickSeason ? (
        <FormField label="Season" error={seasonError}>
          <Select
            items={seasons.map((s) => ({ value: String(s.id), label: s.title }))}
            value={seasonId === null ? null : String(seasonId)}
            onValueChange={(v) => setSeasonId(Number(v))}
          >
            <SelectTrigger accessibilityLabel="Season">
              <SelectValue placeholder="Choose a season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : (
        <Text variant="headline" className="text-foreground">{`To: ${toLabel}`}</Text>
      )}
    </>
  );
}

/**
 * The message in the rich editor, the one an assignment's instructions use (owner 2026-11-14): bold,
 * italic, lists and links, and each paragraph reads right to left when it starts in Arabic. The
 * counter counts the words, not the formatting.
 */
export function MessageField({
  body,
  setBody,
  error,
}: {
  body: string;
  setBody: (html: string) => void;
  error?: string;
}) {
  const length = announcementPlainText(body).length;
  return (
    <FormField label="Message" error={error}>
      <RichTextEditor
        accessibilityLabel="Message"
        value={body}
        onChange={setBody}
        placeholder="Write your announcement"
      />
      {length > COUNTER_FROM ? (
        <Text
          variant="caption"
          className={length > ANNOUNCEMENT_BODY_MAX ? "text-destructive" : "text-muted-foreground"}
        >
          {`${length} / ${ANNOUNCEMENT_BODY_MAX}`}
        </Text>
      ) : null}
    </FormField>
  );
}
