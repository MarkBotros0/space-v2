/** Before a frame is measured: 16:9 on a 360dp phone inside a card's padding. */
const FIRST_HEIGHT = 180;

/**
 * A YouTube frame's height for its width, at 16:9. A fixed height cut YouTube's control bar off on
 * wider phones (owner, 2026-11-13: "the video controls is hidden"), since the video scales to the width.
 */
export function videoHeight(width: number): number {
  return width > 0 ? Math.round((width * 9) / 16) : FIRST_HEIGHT;
}
