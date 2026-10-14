/**
 * Port of v1 src/components/ui/modal.tsx at phone width, where v1 renders a
 * bottom sheet (its md: centred-dialog classes are dropped).
 * Native differences: Base UI Dialog → RN Modal; the backdrop fades and the
 * sheet slides up (300ms, v1's duration); backdrop-blur-sm → BlurView
 * intensity 15; the sheet adds the bottom safe-area inset under p-4 (v1 web
 * has no home indicator); ModalTrigger/ModalClose take one child and add
 * onPress to it (Base UI's render-prop trigger).
 */
import { BlurView } from "expo-blur";
import { X } from "lucide-react-native";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Animated, KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Text } from "./text";

iconWithClassName(X);

type Ctx = { open: boolean; setOpen: (open: boolean) => void };
const ModalContext = createContext<Ctx>({ open: false, setOpen: () => {} });

function Modal({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return <ModalContext.Provider value={{ open, setOpen }}>{children}</ModalContext.Provider>;
}

function withPress(children: ReactNode, onPress: () => void) {
  const child = Children.only(children);
  if (!isValidElement(child)) return child;
  const el = child as ReactElement<{ onPress?: () => void }>;
  return cloneElement(el, {
    onPress: () => {
      el.props.onPress?.();
      onPress();
    },
  });
}

function ModalTrigger({ children }: { children: ReactElement }) {
  const { setOpen } = useContext(ModalContext);
  return withPress(children, () => setOpen(true));
}

function ModalClose({ children }: { children: ReactElement }) {
  const { setOpen } = useContext(ModalContext);
  return withPress(children, () => setOpen(false));
}

function ModalContent({ className, children }: { className?: string; children?: ReactNode }) {
  const { open, setOpen } = useContext(ModalContext);
  // Context, not the hook: a sheet rendered outside SafeAreaProvider (tests,
  // early boot) gets 0 insets instead of throwing.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (open) {
      slide.setValue(1);
      Animated.timing(slide, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [open, slide]);
  return (
    <RNModal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <Pressable testID="modal-backdrop" accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
        <BlurView intensity={15} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View className="absolute inset-0 bg-background/70" />
      </Pressable>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end" pointerEvents="box-none">
        <Animated.View
          style={[
            { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }) }] },
            shadowStyle("lift"),
          ]}
        >
          <View
            className={cn("max-h-[90vh] flex-col gap-4 rounded-t-2xl border-t border-border bg-card p-4", className)}
            style={{ paddingBottom: Math.max(16, bottomInset) }}
          >
            <View className="absolute left-1/2 top-2 -ml-5 h-1 w-10 rounded-full bg-muted-foreground/30" />
            {children}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setOpen(false)}
              className="absolute right-3 top-3 size-8 items-center justify-center rounded-md active:bg-muted"
            >
              <X size={16} className="text-muted-foreground" />
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

function ModalHeader({ className, children }: { className?: string; children?: ReactNode }) {
  return <View className={cn("flex-col gap-1 pr-8", className)}>{children}</View>;
}

function ModalTitle({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text accessibilityRole="header" className={cn("text-lg font-semibold leading-tight tracking-tight", className)}>
      {children}
    </Text>
  );
}

function ModalDescription({ className, children }: { className?: string; children?: ReactNode }) {
  return <Text className={cn("text-sm text-muted-foreground", className)}>{children}</Text>;
}

function ModalFooter({ className, children }: { className?: string; children?: ReactNode }) {
  return <View className={cn("flex-col-reverse gap-2", className)}>{children}</View>;
}

export { Modal, ModalTrigger, ModalClose, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter };
