import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  ANNOUNCEMENT_BODY_MAX,
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  type AnnouncementTargetsResponse,
  type CreateAnnouncementRequest,
  type PollInput,
  type UpdateAnnouncementRequest,
} from "@space/shared";

import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import {
  FormField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from "../../design/ui";
import { PillButton } from "../../design/ui/pill-button";
import { ConfirmPostSheet } from "./confirm-post-sheet";
import { EMPTY_POLL, PollEditor, pollErrors, type PollErrors } from "./poll/poll-editor";

/** The counter shows once the message is this long. */
const COUNTER_FROM = 4000;
const AUDIENCE_OPTIONS = [
  { value: "COMMUNITY", label: "Everyone" },
  { value: "SEASON", label: "A season" },
];

/** `poll` is the poll as edited: null for none, with ids on the options a post already had. */
export type PostFormValues = { body: string; poll: PollInput | null };

type Fields = { body?: string; season?: string; poll?: PollErrors };

/** Field errors from the shared schema, keyed by the field they belong to. */
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Fields {
  const out: Fields = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (key === "body") out.body ??= "Enter a message (up to 5000 characters).";
  }
  const poll = pollErrors(issues);
  if (Object.keys(poll).length > 0) out.poll = poll;
  return out;
}

type Props = {
  screenTitle: string;
  saveLabel: string;
  /** A failed write's message, drawn as a callout above the fields. */
  error: string | null;
  pending: boolean;
  initial?: PostFormValues;
} & (
  | {
      mode: "create";
      /** New post: who the author may post to. */
      targets: AnnouncementTargetsResponse;
      onSubmit: (request: CreateAnnouncementRequest) => void;
    }
  | {
      mode: "edit";
      /** Edit: where it went, read-only. */
      toLabel: string;
      onSubmit: (request: UpdateAnnouncementRequest) => void;
    }
);

/** The composer for both screens; the audience is chosen on New and read-only on Edit. */
export function PostForm(props: Props) {
  const { screenTitle, saveLabel, error, pending, initial } = props;
  const targets = props.mode === "create" ? props.targets : null;
  const [body, setBody] = useState(initial?.body ?? "");
  const [poll, setPoll] = useState<PollInput | null>(initial?.poll ?? null);
  const [errors, setErrors] = useState<Fields>({});
  const [confirming, setConfirming] = useState(false);

  const community = targets?.community ?? false;
  const seasons = targets?.seasons ?? [];
  const canChoose = community && seasons.length > 0;
  const [audience, setAudience] = useState<"COMMUNITY" | "SEASON">(community ? "COMMUNITY" : "SEASON");
  const [seasonId, setSeasonId] = useState<number | null>(seasons.length === 1 ? seasons[0]!.id : null);
  const toSeason = targets !== null && (canChoose ? audience === "SEASON" : !community);
  const chosen = toSeason ? (seasons.find((s) => s.id === seasonId) ?? null) : null;
  const pickSeason = toSeason && seasons.length > 1;

  // A failed post closes the confirm so its message, above the fields, is what shows.
  useEffect(() => {
    if (error) setConfirming(false);
  }, [error]);

  const toLabel = props.mode === "edit" ? props.toLabel : toSeason ? (chosen?.title ?? "") : "Everyone";
  const reach = toSeason ? (chosen?.reach ?? 0) : (targets?.communityReach ?? 0);

  function buildRequest(): CreateAnnouncementRequest | null {
    const base = { body, ...(poll ? { poll } : {}) };
    const parsed = createAnnouncementRequestSchema.safeParse(
      toSeason ? { audience: "SEASON", seasonId: seasonId ?? 0, ...base } : { audience: "COMMUNITY", ...base },
    );
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues);
    if (toSeason && chosen === null) errs.season = "Choose a season.";
    setErrors(errs);
    return parsed.success && Object.keys(errs).length === 0 ? parsed.data : null;
  }

  /** An edit always sends a poll it had or has (ids keep votes; identical input is a no-op), null once removed, nothing if it never had one. */
  function buildUpdate(): UpdateAnnouncementRequest | null {
    const hadPoll = initial?.poll != null;
    const parsed = updateAnnouncementRequestSchema.safeParse({
      body,
      ...(poll ? { poll } : hadPoll ? { poll: null } : {}),
    });
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues);
    setErrors(errs);
    return parsed.success ? parsed.data : null;
  }

  function submit(): void {
    if (props.mode === "edit") {
      const update = buildUpdate();
      if (update !== null) props.onSubmit(update);
      return;
    }
    if (buildRequest() !== null) setConfirming(true);
  }

  return (
    <Screen
      title={screenTitle}
      footer={<SaveBar label={saveLabel} onPress={submit} loading={pending && !confirming} disabled={pending} />}
    >
      <View className="flex-col gap-4">
        {error ? (
          <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" className="rounded-control bg-bad-soft px-3 py-2">
            <Text variant="subhead" className="text-bad">
              {error}
            </Text>
          </View>
        ) : null}

        {canChoose ? (
          <SegmentedControl
            options={AUDIENCE_OPTIONS}
            value={audience}
            onChange={(v) => setAudience(v as "COMMUNITY" | "SEASON")}
          />
        ) : null}
        {pickSeason ? (
          <FormField label="Season" error={errors.season}>
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

        <FormField label="Message" error={errors.body}>
          <Textarea
            accessibilityLabel="Message"
            value={body}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            onChangeText={setBody}
            className="min-h-40"
          />
          {body.length > COUNTER_FROM ? (
            <Text variant="caption" className="text-muted-foreground">
              {`${body.length} / ${ANNOUNCEMENT_BODY_MAX}`}
            </Text>
          ) : null}
        </FormField>

        {poll ? (
          <PollEditor value={poll} onChange={setPoll} errors={errors.poll ?? {}} onRemove={() => setPoll(null)} />
        ) : (
          <PillButton label="Add a poll" onPress={() => setPoll(EMPTY_POLL)} className="self-start" />
        )}
      </View>

      {targets ? (
        <ConfirmPostSheet
          open={confirming}
          audienceLabel={toLabel}
          withPoll={poll !== null}
          reach={reach}
          pending={pending}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            const request = buildRequest();
            if (request !== null && props.mode === "create") props.onSubmit(request);
          }}
        />
      ) : null}
    </Screen>
  );
}
