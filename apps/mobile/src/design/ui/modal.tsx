/**
 * Legacy Modal (v1's phone-width bottom sheet), kept so its call sites compile,
 * drawn like the redesign's Sheet: `surface`, top radius 24, a `separator`
 * grabber, the Sheet's black/40 scrim, no shadow; title `headline`, description
 * `subhead`. It slides up over DURATION.slow; under reduced motion it appears
 * in place (the RN Modal's own fade remains). RN Modal + core Animated (not
 * Reanimated), so the class rules for Animated.* do not apply here. The sheet
 * adds the bottom safe-area inset under p-4; ModalTrigger/ModalClose take one
 * child and add onPress to it (Base UI's render-prop trigger).
 * Plans 02–05 move the call sites to Sheet and delete this file.
 */
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

import { DURATION, useReducedMotion } from "../motion";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
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

/**
 * `dismissible={false}`: v1's `onOpenChange={noop}` sheets — no ×, and the
 * backdrop does nothing. The Android back button still requests a close
 * (onOpenChange(false)), so the caller decides what back means.
 */
function ModalContent({
  className,
  children,
  dismissible = true,
}: {
  className?: string;
  children?: ReactNode;
  dismissible?: boolean;
}) {
  const { open, setOpen } = useContext(ModalContext);
  // Context, not the hook: a sheet rendered outside SafeAreaProvider (tests,
  // early boot) gets 0 insets instead of throwing.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const reduced = useReducedMotion();
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!open) return;
    if (reduced) {
      slide.setValue(0);
      return;
    }
    slide.setValue(1);
    Animated.timing(slide, { toValue: 0, duration: DURATION.slow, useNativeDriver: true }).start();
  }, [open, reduced, slide]);
  return (
    <RNModal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <Pressable
        testID="modal-backdrop"
        accessibilityLabel="Dismiss"
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (dismissible) setOpen(false);
        }}
      >
        <View className="absolute inset-0 bg-black/40" />
      </Pressable>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end" pointerEvents="box-none">
        <Animated.View style={{ transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }) }] }}>
          <View
            className={cn("max-h-[90vh] flex-col gap-4 rounded-t-sheet bg-surface p-4 pt-6", className)}
            style={{ paddingBottom: Math.max(16, bottomInset) }}
          >
            <View className="absolute left-1/2 top-3 -ml-5 h-1 w-10 rounded-full bg-separator" />
            {children}
            {dismissible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setOpen(false)}
              className="absolute right-2 top-2 size-11 items-center justify-center rounded-full active:bg-muted"
            >
              <X size={16} className="text-muted-foreground" />
            </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

function ModalHeader({ className, children }: { className?: string; children?: ReactNode }) {
  return <View className={cn("flex-col gap-1 pr-10", className)}>{children}</View>;
}

function ModalTitle({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text variant="headline" accessibilityRole="header" className={className}>
      {children}
    </Text>
  );
}

function ModalDescription({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text variant="subhead" className={cn("text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

function ModalFooter({ className, children }: { className?: string; children?: ReactNode }) {
  return <View className={cn("flex-col-reverse gap-2", className)}>{children}</View>;
}

export { Modal, ModalTrigger, ModalClose, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter };
