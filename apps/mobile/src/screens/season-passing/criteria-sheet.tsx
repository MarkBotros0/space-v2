/**
 * The season's pass criteria in a sheet (season passing, spec 2026-11-12 "Pass criteria on the
 * season"): three weights with a live "Total 100%" that says plainly when it is off, and the pass
 * mark. Owner, 2026-11-13 ("much easier … an option to split equally"): one line per weight, a
 * Split equally button, the mix as a live bar, and common pass marks one tap away. A number the season has nothing for is off and fixed at 0. Read-only, it lists the
 * criteria with a Close button (a leader). The passing outlook and the End flow's criteria step
 * both open it; the caller saves and passes back `saving` and `error`.
 */
import type { PassCriteria, SeasonAvailability } from "@space/shared";
import { Equal } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, ChoiceChip, Sheet, SheetSaveBar, StatusChip, Text } from "../../design/ui";
import {
  TOTAL_ERROR,
  WEIGHT_KEYS,
  draftFrom,
  draftWeights,
  fieldOff,
  parseCriteria,
  splitEqually,
  type CriteriaDraft,
} from "./criteria-model";
import { NUMBER_LABELS } from "./outlook-model";
import { PercentStepper } from "./percent-stepper";
import { WeightBar } from "./weight-bar";

iconWithClassName(Equal);

type Props = {
  open: boolean;
  initial: PassCriteria;
  available: SeasonAvailability;
  readOnly: boolean;
  saveLabel: string;
  saving?: boolean;
  error?: string | null;
  onSave: (c: PassCriteria) => void;
  onClose: () => void;
};

type FieldErrors = Partial<Record<keyof CriteriaDraft | "total", string>>;

const OFF_NOTE = "Nothing to count this season, so it stays at 0.";

/** The live total: its figure, a status in words, and the error while it is off. */
function TotalLine({ total }: { total: number }) {
  const adds = total === 100;
  return (
    <View
      className="flex-col gap-1 rounded-control bg-surface-raised px-3 py-2"
      accessible
      accessibilityLabel={adds ? `Total ${total}%, adds up` : `Total ${total}%. ${TOTAL_ERROR}`}
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="headline" className="min-w-0 flex-1">
          {`Total ${total}%`}
        </Text>
        <StatusChip tone={adds ? "ok" : "bad"} label={adds ? "Adds up" : "Not 100%"} className="shrink-0" />
      </View>
      {adds ? null : (
        <Text variant="subhead" className="text-bad">
          {TOTAL_ERROR}
        </Text>
      )}
    </View>
  );
}

function ReadOnlyCriteria({ criteria }: { criteria: PassCriteria }) {
  return (
    <View className="flex-col gap-4 pb-4">
      <WeightBar weights={criteria.weights} />
      <Text variant="body">{`Pass mark ${criteria.passMark}`}</Text>
    </View>
  );
}

export function CriteriaSheet({
  open,
  initial,
  available,
  readOnly,
  saveLabel,
  saving,
  error,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<CriteriaDraft>(() => draftFrom(initial, available));
  const [errors, setErrors] = useState<FieldErrors>({});
  // Each opening starts from the criteria as they are now.
  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(initial, available));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: keyof CriteriaDraft) => (next: string) => {
    setDraft((d) => ({ ...d, [key]: next }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const split = () => {
    setDraft((d) => ({ ...d, ...splitEqually(available) }));
    setErrors((e) => ({ ...e, attendance: undefined, assignments: undefined, quizzes: undefined, total: undefined }));
  };

  const save = () => {
    const parsed = parseCriteria(draft, available);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    onSave(parsed.criteria);
  };

  if (readOnly) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Pass criteria"
        footer={<SheetSaveBar label="Close" onPress={onClose} />}
      >
        <ReadOnlyCriteria criteria={initial} />
      </Sheet>
    );
  }

  const weights = draftWeights({ ...draft, ...offZeros(available) });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pass criteria"
      footer={<SheetSaveBar label={saveLabel} onPress={save} loading={saving} error={error} />}
    >
      <View className="flex-col gap-5 pb-4">
        <Text variant="subhead" className="text-muted-foreground">
          A student&apos;s score mixes their three numbers by these weights. A score at or above the pass mark is on
          track.
        </Text>
        <View className="flex-col gap-3 rounded-group bg-surface-raised p-4">
          <View className="flex-row items-center gap-2">
            <Text variant="headline" accessibilityRole="header" className="min-w-0 flex-1">
              Weights
            </Text>
            <Button variant="secondary" size="sm" onPress={() => split()}>
              <Equal size={16} className="text-foreground" />
              Split equally
            </Button>
          </View>
          {WEIGHT_KEYS.map((key) => {
            const off = fieldOff(key, available);
            return (
              <PercentStepper
                key={key}
                label={NUMBER_LABELS[key]}
                name={`${NUMBER_LABELS[key].toLowerCase()} weight`}
                value={off ? "0" : draft[key]}
                onChange={set(key)}
                suffix="%"
                off={off}
                note={off ? OFF_NOTE : undefined}
                error={errors[key]}
              />
            );
          })}
          <WeightBar weights={weights} />
          <TotalLine total={weights.attendance + weights.assignments + weights.quizzes} />
        </View>
        <View className="flex-col gap-3">
          <PercentStepper
            label="Pass mark"
            name="pass mark"
            value={draft.passMark}
            onChange={set("passMark")}
            note="Out of 100."
            error={errors.passMark}
          />
          <View className="flex-row flex-wrap gap-2" accessibilityLabel="Common pass marks">
            {COMMON_MARKS.map((mark) => (
              <ChoiceChip
                key={mark}
                label={String(mark)}
                accessibilityLabel={`Pass mark ${mark}`}
                selected={draft.passMark === String(mark)}
                onPress={() => set("passMark")(String(mark))}
              />
            ))}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const COMMON_MARKS = [50, 60, 70, 75, 80];

/** The off fields as "0", for the total. */
function offZeros(available: SeasonAvailability): Partial<CriteriaDraft> {
  const zeros: Partial<CriteriaDraft> = {};
  for (const key of WEIGHT_KEYS) if (fieldOff(key, available)) zeros[key] = "0";
  return zeros;
}
