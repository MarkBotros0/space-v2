/**
 * Text for user-authored content that may be Arabic, English or mixed. Sets the
 * writing direction and alignment from the first strong character, and the
 * Arabic face for rtl text. Never selectable (quiz content must not be copied).
 */
import type { ComponentProps } from "react";

import { textDirection } from "../lib/text-direction";
import { Text } from "./text";

type Props = Omit<ComponentProps<typeof Text>, "children" | "selectable"> & { children: string };

const BOLD_VARIANTS = new Set(["largeTitle", "title", "headline"]);

function ContentText({ children, variant, style, className, ...props }: Props) {
  const rtl = textDirection(children) === "rtl";
  const bold =
    BOLD_VARIANTS.has(variant ?? "body") || /(^|\s)font-(semibold|bold|extrabold|black)(\s|$)/.test(className ?? "");
  return (
    <Text
      variant={variant}
      className={className}
      selectable={false}
      style={[
        { writingDirection: rtl ? "rtl" : "ltr", textAlign: rtl ? "right" : "left" },
        rtl && { fontFamily: bold ? "IBMPlexSansArabic_600SemiBold" : "IBMPlexSansArabic_400Regular" },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

export { ContentText };
