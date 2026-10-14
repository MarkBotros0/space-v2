/**
 * Native stand-in for Base UI's Popover/Select positioner as v1 uses it:
 * the popup opens 6px below its trigger (sideOffset={6}), at least as wide
 * as the trigger when asked (min-w/w-[var(--anchor-width)]), flips above
 * when there is no room below, and closes on an outside press.
 */
import { type ReactNode, useCallback, useRef, useState } from "react";
import { Modal, Pressable, useWindowDimensions, View, type View as ViewType } from "react-native";

import { cn } from "./cn";
import { shadowStyle } from "./shadow";

type Rect = { x: number; y: number; width: number; height: number };

const SIDE_OFFSET = 6;
const EDGE = 8; // keep popups off the screen edge, like Base UI's collision padding

/** Ref for the trigger plus a measure() that records its window position. */
export function useAnchor() {
  const ref = useRef<ViewType>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height }));
  }, []);
  return { ref, rect, measure };
}

export function AnchoredPopover({
  open,
  onClose,
  anchor,
  width,
  align = "start",
  sideOffset = SIDE_OFFSET,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchor: Rect | null;
  /** "anchor" = exactly the trigger's width, "min-anchor" = at least it, undefined = content width. */
  width?: "anchor" | "min-anchor";
  /** Base UI `align`: "end" lines the popup's right edge up with the trigger's. */
  align?: "start" | "end";
  sideOffset?: number;
  className?: string;
  children: ReactNode;
}) {
  const win = useWindowDimensions();
  const [popupHeight, setPopupHeight] = useState(0);
  const [popupWidth, setPopupWidth] = useState(0);

  let position: { top?: number; bottom?: number; left: number } = { top: 0, left: EDGE };
  if (anchor) {
    const below = anchor.y + anchor.height + sideOffset;
    const fitsBelow = below + popupHeight <= win.height - EDGE;
    const wanted = align === "end" ? anchor.x + anchor.width - popupWidth : anchor.x;
    const left = Math.max(EDGE, Math.min(wanted, win.width - EDGE - popupWidth));
    position = fitsBelow || anchor.y < popupHeight ? { top: below, left } : { bottom: win.height - anchor.y + sideOffset, left };
  }
  const sizing =
    anchor && width === "anchor"
      ? { width: anchor.width }
      : anchor && width === "min-anchor"
        ? { minWidth: anchor.width }
        : undefined;

  return (
    <Modal transparent visible={open} onRequestClose={onClose} statusBarTranslucent animationType="fade">
      <Pressable accessibilityLabel="Dismiss" className="absolute inset-0" onPress={onClose} />
      <View
        onLayout={(e) => {
          setPopupHeight(e.nativeEvent.layout.height);
          setPopupWidth(e.nativeEvent.layout.width);
        }}
        className={cn("absolute", className)}
        style={[position, sizing, { maxWidth: win.width - EDGE * 2 }, shadowStyle("md")]}
      >
        {children}
      </View>
    </Modal>
  );
}
