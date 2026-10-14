# Foundations — remaining differences from v1

Compared on the `jpc-ui` emulator (375dp wide) against v1's `/dev/design-system`
capture, light and dark, plus the modal sheet and the Select popup. Everything
not listed here matched at CSS-pixel level (sizes, spacing, radii, colours,
copy, icons). Comparison page: `~/projects/JPC/.v2-captures/foundations/compare-foundations.html`
(devbox only, never published).

## v1 behaviour reproduced on purpose — owner to decide

| Component | What v1 does | Why it is that way |
|---|---|---|
| Tabs | No tab ever looks selected: all triggers muted, no teal underline. | v1 styles `data-[selected]:…` but Base UI marks the active tab `data-active`. A v1 bug, used on the season-detail and student-detail screens. Reproduced because the rule is "match v1 exactly"; the fix is one class change in both apps. |

## Platform differences (cannot match, or matching would be worse)

| Component | Difference | Reason |
|---|---|---|
| Inline `<code>` | Mono font and muted background kept; no padding or rounded corners. | Nested React Native text cannot take padding or a border radius. |
| Inputs, selects, triggers | Focus and invalid states change the border colour only; v1's 3px outer ring is not drawn. | No `ring`/outline in React Native; a fake ring would shift layout. |
| Dashed borders (empty state, file upload) | Dash length/spacing differ slightly. | Drawn by the platform, not the browser. |
| Text | Glyph hinting and letter spacing differ slightly (Chromium vs Android). | Same Geist font files; different rasterisers. Widths match within ~1px. |
| Status bar | Present on device; follows the theme. | No equivalent on the web page. |
| Modal sheet | Adds the device's bottom safe-area inset under `p-4`. | Phones with a home indicator; v1 on the web has none. |
| Tab bar | `backdrop-saturate-150` not applied (blur is). | No saturate filter in expo-blur. |
| Empty state | v1's `blur-xl` glow behind the icon is omitted. | v1 blurs it to near-invisibility; React Native has no blur filter for it. |

## Motion not reproduced

| Component | v1 | v2 |
|---|---|---|
| Showcase "Motion" cards | Stagger fade-up on load and on "Replay reveal". | Static. |
| Tab bar | Active highlight slides between tabs. | Highlight jumps. |
| Theme toggle | Sun/moon rotate-and-fade swap. | Instant swap. |
| Switch | Thumb slides. | Thumb jumps. |
| Skeleton | Gradient shimmer sweep. | Opacity pulse over the same 1.6s. |

## Interaction differences

| Component | v1 | v2 |
|---|---|---|
| Charts | Hover tooltips. | No tooltips (no hover). |
| Toaster | `top-right`. | `top-center` — sonner already spans the width at phone size. |
| Rich-text editor link | `window.prompt("URL")`. | A sheet with the same "URL" prompt, Cancel / OK. |
| File upload | Click or drag-and-drop a file. | Visual only; uploads are off (`ENABLE_UPLOADS=false`). |

## Capture artefacts in v1's reference shots (not differences)

- The medium logo (`Logo size="md"`) is blank in v1's design-system capture: a
  lazy-loaded image that had not loaded when the full-page screenshot was taken.
- Every signed-in v1 page shows a yellow "switch user" icon in the top bar: the
  local copy runs with `DEV_USER_SWITCHER=1`. Not part of v1's real UI.

## Implementation notes found during the check

- `font-mono` compiles correctly but the face does not reach the native text
  at runtime; the base `Text` applies Geist Mono as an explicit style.
- v1 text with no size class is 16px / 24px (browser default + Tailwind's 1.5);
  the base `Text` starts there.
- v1's palette tokens had been exported wrongly (`@theme inline` emits no CSS
  variables); fixed in `tools/ui-reference/export-tokens.mjs` and regenerated.
- Porting rule: Button, Badge and the pills size to their content in a v1 block
  but stretch in a React Native column — call sites that are blocks in v1, or
  use `w-fit`, add `self-start`.
