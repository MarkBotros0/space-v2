/**
 * Port of v1 src/components/ui/rich-text-view.tsx.
 * Sanitising follows v1's sanitize-html options: allowed tags p br strong em
 * s a ul ol li h2 h3 blockquote code pre; only a[href] with http/https/mailto;
 * other tags are unwrapped (text kept); script/style/textarea/option/noscript
 * are dropped with their content (sanitize-html's nonTextTags).
 * Typography: v1 writes `prose prose-sm` but ships no typography plugin, so
 * what renders is Tailwind's reset — text-sm, no paragraph or list margins,
 * no list markers, headings at body size and weight, links in text colour.
 * That is reproduced here. Native differences: none intended.
 */
import { type ChildNode, type Element, isTag, isText } from "domhandler";
import { parseDocument } from "htmlparser2";
import { Fragment, type ReactNode } from "react";
import { Linking, Text as RNText, View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

const ALLOWED = new Set(["p", "br", "strong", "em", "s", "a", "ul", "ol", "li", "h2", "h3", "blockquote", "code", "pre"]);
const DROPPED = new Set(["script", "style", "textarea", "option", "noscript"]);
const BLOCK = new Set(["p", "li", "h2", "h3", "blockquote", "pre"]);
const SAFE_HREF = /^(https?:|mailto:)/i;

function safeHref(el: Element): string | null {
  const href = el.attribs.href?.trim();
  return href && SAFE_HREF.test(href) ? href : null;
}

/** Inline content of a block: nested Text keeps strong/em/s/code/a styling. */
function inline(nodes: ChildNode[], key: string): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}.${i}`;
    if (isText(node)) return node.data;
    if (!isTag(node) || DROPPED.has(node.name)) return null;
    const children = inline(node.children, k);
    switch (ALLOWED.has(node.name) ? node.name : "unwrap") {
      case "br":
        return "\n";
      // Plain RN Text inside a block inherits its size and colour, as inline
      // HTML does; each sets only what the tag changes.
      case "strong":
        return <RNText key={k} style={{ fontFamily: "Geist_700Bold" }}>{children}</RNText>;
      case "em":
        return <RNText key={k} style={{ fontStyle: "italic" }}>{children}</RNText>;
      case "s":
        return <RNText key={k} style={{ textDecorationLine: "line-through" }}>{children}</RNText>;
      case "code":
        return <RNText key={k} style={{ fontFamily: "GeistMono_400Regular" }}>{children}</RNText>;
      case "a": {
        const href = safeHref(node);
        return href ? (
          <RNText key={k} accessibilityRole="link" onPress={() => void Linking.openURL(href)}>
            {children}
          </RNText>
        ) : (
          <Fragment key={k}>{children}</Fragment>
        );
      }
      default:
        return <Fragment key={k}>{children}</Fragment>;
    }
  });
}

/** Splits a node list into block-level lines, as the browser lays them out. */
function blocks(nodes: ChildNode[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let run: ChildNode[] = [];
  const flush = () => {
    if (run.some((n) => !isText(n) || n.data.trim() !== "")) {
      out.push(<Text key={`${key}.r${out.length}`} className="text-sm text-foreground">{inline(run, `${key}.r${out.length}`)}</Text>);
    }
    run = [];
  };
  nodes.forEach((node, i) => {
    if (isTag(node) && DROPPED.has(node.name)) return;
    if (isTag(node) && (node.name === "ul" || node.name === "ol" || !ALLOWED.has(node.name))) {
      if (!ALLOWED.has(node.name) && !["div", "section", "article", "ul", "ol"].includes(node.name)) {
        run.push(node); // unknown inline tag: unwrap in place
        return;
      }
      flush();
      out.push(...blocks(node.children, `${key}.${i}`));
      return;
    }
    if (isTag(node) && BLOCK.has(node.name)) {
      flush();
      out.push(
        <Text key={`${key}.${i}`} className={cn("text-sm text-foreground", node.name === "pre" && "font-mono")}>
          {inline(node.children, `${key}.${i}`)}
        </Text>,
      );
      return;
    }
    run.push(node);
  });
  flush();
  return out;
}

export function RichTextView({ html, className, emptyText }: { html: string | null | undefined; className?: string; emptyText?: string }) {
  if (!html || html.trim() === "" || html === "<p></p>") {
    if (!emptyText) return null;
    return <Text className={cn("text-sm italic text-muted-foreground", className)}>{emptyText}</Text>;
  }
  const doc = parseDocument(html);
  return <View className={cn("max-w-none", className)}>{blocks(doc.children, "rt")}</View>;
}
