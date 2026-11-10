import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  type AnnouncementTargetsResponse,
  type AnnouncementPoll,
  type CreateAnnouncementRequest,
  type PollInput,
  type UpdateAnnouncementRequest,
} from "@space/shared";

import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { Text } from "../../design/ui";
import { PillButton } from "../../design/ui/pill-button";
import { ConfirmEditSheet } from "./confirm-edit-sheet";
import { AudienceSection, MessageField, type Audience } from "./post-form-sections";
import { ConfirmPostSheet } from "./confirm-post-sheet";
import { editWarnings } from "./poll/edit-warnings";
import { PollEditor, pollErrors, type PollErrors } from "./poll/poll-editor";
import { pollPatch, usePollDraft } from "./poll/use-poll-draft";

/** `poll` is the poll as edited: null for none, with ids on the options a post already had. */
type PostFormValues = { body: string; poll: PollInput | null };

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
      /** The poll as saved, with its counts: what an edit is warned against. */
      currentPoll?: AnnouncementPoll | null;
      /** The server's count when it refused with `poll_votes_lost`: reopens the sheet. */
      serverLostVotes?: number | null;
      /** The sheet was cancelled after a server refusal. */
      onDismissVoteLoss?: () => void;
      onSubmit: (request: UpdateAnnouncementRequest) => void;
    }
);

/** The composer for both screens; the audience is chosen on New and read-only on Edit. */
export function PostForm(props: Props) {
  const { screenTitle, saveLabel, error, pending, initial } = props;
  const targets = props.mode === "create" ? props.targets : null;
  const [body, setBody] = useState(initial?.body ?? "");
  const draft = usePollDraft(initial?.poll ?? null);
  const { poll } = draft;
  const [errors, setErrors] = useState<Fields>({});
  const [confirming, setConfirming] = useState(false);

  const community = targets?.community ?? false;
  const seasons = targets?.seasons ?? [];
  const canChoose = community && seasons.length > 0;
  const [audience, setAudience] = useState<Audience>(community ? "COMMUNITY" : "SEASON");
  const [seasonId, setSeasonId] = useState<number | null>(seasons.length === 1 ? seasons[0]!.id : null);
  const toSeason = targets !== null && (canChoose ? audience === "SEASON" : !community);
  const chosen = toSeason ? (seasons.find((s) => s.id === seasonId) ?? null) : null;
  const pickSeason = toSeason && seasons.length > 1;

  // A failed post closes the confirm so its message, above the fields, is what shows.
  const serverLost = props.mode === "edit" ? (props.serverLostVotes ?? null) : null;
  // Kept after the retry starts, so the sheet's words don't flip back while it saves.
  const [lostSeen, setLostSeen] = useState<number | null>(null);
  // The vote total the user confirmed in the sheet; a 409 with this same count resends at once.
  const confirmedLoss = useRef<number | null>(null);
  useEffect(() => {
    if (serverLost !== null) {
      if (props.mode === "edit" && confirmedLoss.current === serverLost) {
        confirmedLoss.current = null;
        const update = buildUpdate();
        if (update !== null) props.onSubmit({ ...update, confirmVoteLoss: true });
        return;
      }
      setConfirming(true);
      setLostSeen(serverLost);
    } else if (error) {
      setConfirming(false);
      setLostSeen(null);
      // That confirmed count belonged to the failed save; a later 409 must ask again.
      confirmedLoss.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, serverLost]);

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

  /**
   * An edit sends `poll` only when it differs from the poll as opened (null once removed), so a
   * message-only save can't undo another manager's poll edit made in the meantime.
   */
  function buildUpdate(): UpdateAnnouncementRequest | null {
    const parsed = updateAnnouncementRequestSchema.safeParse({ body, ...pollPatch(draft.opened, poll) });
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues);
    setErrors(errs);
    return parsed.success ? parsed.data : null;
  }

  // Warn only about a poll change that will actually be sent.
  const warnings = props.mode === "edit" && draft.changed ? editWarnings(props.currentPoll ?? null, poll) : null;

  function submit(): void {
    if (props.mode === "edit") {
      const update = buildUpdate();
      if (update === null) return;
      if (warnings !== null && warnings.lines.length > 0) setConfirming(true);
      else props.onSubmit(update);
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
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="rounded-control bg-bad-soft px-3 py-2"
          >
            <Text variant="subhead" className="text-bad">
              {error}
            </Text>
          </View>
        ) : null}

        <AudienceSection
          canChoose={canChoose}
          audience={audience}
          setAudience={setAudience}
          pickSeason={pickSeason}
          seasons={seasons}
          seasonId={seasonId}
          setSeasonId={setSeasonId}
          seasonError={errors.season}
          toLabel={toLabel}
        />
        <MessageField body={body} setBody={setBody} error={errors.body} />

        {poll ? (
          <PollEditor value={poll} onChange={draft.setPoll} errors={errors.poll ?? {}} onRemove={draft.remove} />
        ) : (
          <PillButton label="Add a poll" onPress={draft.add} className="self-start" />
        )}
      </View>

      {props.mode === "edit" ? (
        <ConfirmEditSheet
          open={confirming}
          lines={warnings?.lines ?? []}
          serverLostVotes={serverLost ?? lostSeen}
          pending={pending}
          onClose={() => {
            setConfirming(false);
            setLostSeen(null);
            confirmedLoss.current = null;
            props.onDismissVoteLoss?.();
          }}
          onConfirm={() => {
            const update = buildUpdate();
            if (update === null) return;
            // Only a count the server itself reported unlocks the flag; the first save never sends it.
            if (serverLost !== null || lostSeen !== null) {
              props.onSubmit({ ...update, confirmVoteLoss: true });
              return;
            }
            confirmedLoss.current = warnings?.losesVotes ? warnings.lostVotes : null;
            props.onSubmit(update);
          }}
        />
      ) : null}

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
