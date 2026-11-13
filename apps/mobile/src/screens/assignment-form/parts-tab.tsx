/**
 * The Parts tab: the parts as numbered cards in order, the add buttons at the
 * foot (one forum at most), a sheet per kind to add or edit one, and remove
 * through a confirm dialog. The parts live in `usePartsDraft`; the form's one
 * Save sends them with Details.
 */
import { useState } from "react";
import { View } from "react-native";
import type { AssignmentPartInput, AssignmentPartKind } from "@space/shared";

import { FormErrorBox } from "../../design/forms/form-parts";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import { EmptyState } from "../../design/ui/empty-state";
import { PillButton } from "../../design/ui/pill-button";
import { Text } from "../../design/ui/text";
import { PartCard } from "./part-card";
import { EssayPartSheet } from "./part-sheets/essay-part-sheet";
import { ForumPartSheet } from "./part-sheets/forum-part-sheet";
import { PART_KIND_NAMES, type EssayDraft, type ForumDraft, type VideoDraft } from "./part-sheets/part-fields";
import { VideoPartSheet } from "./part-sheets/video-part-sheet";
import { partStanding, removedCount, type PartsDraftControls } from "./use-parts-draft";

/** Which sheet is up: a kind, and the part it edits (null: a new one). */
type Editing = { kind: AssignmentPartKind; key: string | null } | null;

export const ONE_FORUM = "One forum per assignment";

function removeMessage(saved: boolean): string {
  return saved
    ? "When you save, students' work on this part is removed with it."
    : "It hasn't been saved yet, so no student has work on it.";
}

/** The banner over changed parts: what Save will do, so nothing is lost by leaving. */
export function unsavedLine(removed: number): string {
  const gone = removed === 0 ? "" : ` ${removed === 1 ? "1 part is" : `${removed} parts are`} removed.`;
  return `Changes to the parts aren't saved yet.${gone} Tap Save changes to keep them.`;
}

export function PartsTab({
  draft,
  assignmentId,
  listError,
  partErrors,
  onPartEdited,
}: {
  draft: PartsDraftControls;
  /** The saved assignment's id; null while it is new (a video's questions wait for it). */
  assignmentId: number | null;
  listError: string | null;
  partErrors: Record<string, string>;
  /** A part was edited: its issue from the last Save no longer applies. */
  onPartEdited?: (key: string) => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);

  const open = (kind: AssignmentPartKind, key: string | null) => setEditing({ kind, key });
  const close = () => setEditing(null);
  const current = editing?.key == null ? null : (draft.parts.find((p) => p.key === editing.key) ?? null);
  const save = (part: AssignmentPartInput) => {
    if (editing?.key == null) draft.add(part);
    else {
      draft.edit(editing.key, part);
      onPartEdited?.(editing.key);
    }
  };
  const removing = draft.parts.find((p) => p.key === draft.removing) ?? null;
  const sheetOpen = (kind: AssignmentPartKind) => editing?.kind === kind;

  // Only an assignment already saved has changes "not saved yet"; a new one is all unsaved.
  const tracked = assignmentId !== null;
  const standings = draft.parts.map((p, i) => (tracked ? partStanding(p, i, draft.saved) : null));
  const removed = tracked ? removedCount(draft.parts, draft.saved) : 0;
  const unsaved = standings.some((st) => st !== null) || removed > 0;

  return (
    <View className="flex-col gap-4">
      {unsaved ? (
        <View accessibilityRole="alert" className="rounded-group border border-warn bg-warn-soft p-3">
          <Text variant="subhead" className="text-foreground">
            {unsavedLine(removed)}
          </Text>
        </View>
      ) : null}
      {draft.parts.length === 0 ? (
        <EmptyState title="No parts yet" description="Add a video, an essay question or a forum post." />
      ) : (
        draft.parts.map((part, index) => (
          <PartCard
            key={part.key}
            part={part}
            index={index}
            count={draft.parts.length}
            error={partErrors[part.key]}
            standing={standings[index] ?? null}
            onEdit={() => open(part.kind, part.key)}
            onMove={(by) => draft.move(part.key, by)}
            onRemove={() => draft.askRemove(part.key)}
          />
        ))
      )}
      <FormErrorBox message={listError} />
      <View className="flex-row flex-wrap items-center gap-2">
        <PillButton label="+ Video" accessibilityLabel="Add a video" onPress={() => open("VIDEO", null)} />
        <PillButton
          label="+ Essay question"
          accessibilityLabel="Add an essay question"
          onPress={() => open("ESSAY", null)}
        />
        <PillButton
          label="+ Forum"
          accessibilityLabel="Add a forum"
          disabled={!draft.forumAllowed}
          onPress={() => open("FORUM", null)}
        />
      </View>
      {!draft.forumAllowed ? (
        <Text variant="caption" className="text-muted-foreground">
          {ONE_FORUM}
        </Text>
      ) : null}

      <VideoPartSheet
        open={sheetOpen("VIDEO")}
        onClose={close}
        initial={current?.kind === "VIDEO" ? (current as VideoDraft) : null}
        assignmentId={assignmentId}
        onSave={save}
      />
      <EssayPartSheet
        open={sheetOpen("ESSAY")}
        onClose={close}
        initial={current?.kind === "ESSAY" ? (current as EssayDraft) : null}
        onSave={save}
      />
      <ForumPartSheet
        open={sheetOpen("FORUM")}
        onClose={close}
        initial={current?.kind === "FORUM" ? (current as ForumDraft) : null}
        onSave={save}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) draft.cancelRemove();
        }}
        title={removing === null ? "Remove this part?" : `Remove this ${PART_KIND_NAMES[removing.kind].toLowerCase()}?`}
        description={removeMessage(removing?.id !== undefined)}
        confirmLabel="Remove part"
        destructive
        onConfirm={draft.confirmRemove}
      />
    </View>
  );
}
