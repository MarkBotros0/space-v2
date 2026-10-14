/**
 * Port of v1 src/components/ui/rich-text-editor.tsx (Tiptap StarterKit +
 * Link) via @10play/tentap-editor, the same Tiptap schema in a WebView.
 * Toolbar: v1's buttons, order, icons and variants (secondary when active,
 * ghost otherwise, icon-sm); Undo/Redo pushed right.
 * Native differences: v1's window.prompt("URL") for links → a small sheet
 * with the same prompt; the editable area is styled by CSS injected into
 * the WebView to v1's reset typography (text-sm, no margins, no list
 * markers) in Geist; focus ring → border-ring while focused.
 */
import {
  CoreBridge,
  PlaceholderBridge,
  RichText,
  TenTapStartKit,
  useBridgeState,
  useEditorBridge,
} from "@10play/tentap-editor";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Redo2, Strikethrough, Undo2 } from "lucide-react-native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";
import { Button } from "./button";
import { Input } from "./input";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "./modal";

iconWithClassName(Bold, Italic, LinkIcon, List, ListOrdered, Redo2, Strikethrough, Undo2);

function editorCss(c: Record<string, string>) {
  return `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;700&display=swap');
* { margin: 0; padding: 0; }
body, .ProseMirror { font-family: 'Geist', sans-serif; font-size: 14px; line-height: 20px; color: ${c.foreground}; background: ${c.background}; }
.ProseMirror { min-height: 128px; padding: 8px 12px; outline: none; }
.ProseMirror h2, .ProseMirror h3 { font-size: inherit; font-weight: inherit; }
.ProseMirror ul, .ProseMirror ol { list-style: none; }
.ProseMirror a { color: inherit; text-decoration: inherit; }
.ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: ${c["muted-foreground"]}; float: left; height: 0; pointer-events: none; }
`;
}

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder = "Write something…", disabled, invalid, className }: RichTextEditorProps) {
  const colors = useThemeColors();
  const lastHtml = useRef(value);
  const editor = useEditorBridge({
    initialContent: value || "",
    editable: !disabled,
    bridgeExtensions: [
      ...TenTapStartKit,
      PlaceholderBridge.configureExtension({ placeholder }),
      CoreBridge.configureCSS(editorCss(colors)),
    ],
    onChange: () => {
      void editor.getHTML().then((html) => {
        lastHtml.current = html;
        onChange(html);
      });
    },
  });
  const state = useBridgeState(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  // Follow outside value changes without echoing our own edits back.
  useEffect(() => {
    if (state.isReady && value !== lastHtml.current) {
      lastHtml.current = value;
      editor.setContent(value || "");
    }
  }, [value, state.isReady, editor]);

  return (
    <View
      className={cn(
        "relative overflow-hidden rounded-md border border-input bg-background",
        state.isFocused && "border-ring",
        invalid && "border-destructive",
        disabled && "opacity-50",
        className,
      )}
    >
      <View className="flex-row flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
        <ToolbarButton active={state.isBoldActive} onPress={() => editor.toggleBold()} label="Bold">
          <Bold size={16} className="text-foreground" />
        </ToolbarButton>
        <ToolbarButton active={state.isItalicActive} onPress={() => editor.toggleItalic()} label="Italic">
          <Italic size={16} className="text-foreground" />
        </ToolbarButton>
        <ToolbarButton active={state.isStrikeActive} onPress={() => editor.toggleStrike()} label="Strikethrough">
          <Strikethrough size={16} className="text-foreground" />
        </ToolbarButton>
        <ToolbarButton active={state.isBulletListActive} onPress={() => editor.toggleBulletList()} label="Bullet list">
          <List size={16} className="text-foreground" />
        </ToolbarButton>
        <ToolbarButton active={state.isOrderedListActive} onPress={() => editor.toggleOrderedList()} label="Numbered list">
          <ListOrdered size={16} className="text-foreground" />
        </ToolbarButton>
        <ToolbarButton
          active={state.isLinkActive}
          onPress={() => {
            setLinkUrl(state.activeLink ?? "https://");
            setLinkOpen(true);
          }}
          label="Link"
        >
          <LinkIcon size={16} className="text-foreground" />
        </ToolbarButton>
        <View className="ml-auto flex-row gap-0.5">
          <ToolbarButton onPress={() => editor.undo()} label="Undo" disabled={!state.canUndo}>
            <Undo2 size={16} className="text-foreground" />
          </ToolbarButton>
          <ToolbarButton onPress={() => editor.redo()} label="Redo" disabled={!state.canRedo}>
            <Redo2 size={16} className="text-foreground" />
          </ToolbarButton>
        </View>
      </View>
      <View className="min-h-32">
        <RichText editor={editor} style={{ minHeight: 128, backgroundColor: "transparent" }} />
      </View>
      <Modal open={linkOpen} onOpenChange={setLinkOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>URL</ModalTitle>
          </ModalHeader>
          <Input accessibilityLabel="URL" value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" autoFocus />
          <ModalFooter>
            <Button variant="outline" onPress={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              onPress={() => {
                // v1: an empty URL removes the link.
                editor.setLink(linkUrl === "" ? null : linkUrl);
                setLinkOpen(false);
              }}
            >
              OK
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </View>
  );
}

function ToolbarButton({
  onPress,
  active,
  disabled,
  label,
  children,
}: {
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}
