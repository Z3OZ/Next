import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View, ViewStyle, StyleProp } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof MaterialDesignIcons>["name"];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <MaterialDesignIcons name={name} size={size} color={color ?? colors.onSurface} />;
}

export const tap = () => {
  Haptics.selectionAsync().catch(() => {});
};

export function IconButton({
  name, onPress, testID, color, size = 22, disabled, active, style,
}: {
  name: IconName; onPress: () => void; testID: string; color?: string; size?: number; disabled?: boolean; active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
        active && { backgroundColor: colors.brandTertiary },
        pressed && { backgroundColor: colors.surfaceTertiary },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <Icon name={name} size={size} color={color ?? (active ? colors.onBrandTertiary : colors.onSurface)} />
    </Pressable>
  );
}

export function Button({
  label, onPress, testID, variant = "primary", icon, disabled, loading, style,
}: {
  label: string; onPress: () => void; testID: string; variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.brandPrimary : variant === "danger" ? colors.error : variant === "secondary" ? colors.surfaceTertiary : "transparent";
  const fg = variant === "primary" ? colors.onBrandPrimary : variant === "danger" ? colors.onError : variant === "secondary" ? colors.onSurfaceTertiary : colors.brandPrimary;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      onPress={onPress}
      style={({ pressed }) => [
        { height: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: bg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "600", fontSize: 15 }}>{loading ? "Please wait…" : label}</Text>
    </Pressable>
  );
}

// ---------- Bottom sheet ----------
export function Sheet({
  visible, onClose, title, children, testID,
}: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID: string }) {
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID={testID}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useSheetStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.backdrop },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: "85%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  title: { color: c.onSurface, fontSize: 18, fontWeight: "700", marginBottom: spacing.md },
}));

export function SheetRow({ icon, label, onPress, testID, danger, right }: { icon: IconName; label: string; onPress: () => void; testID: string; danger?: boolean; right?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: radius.md }, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      <Icon name={icon} size={20} color={danger ? colors.error : colors.onSurfaceSecondary} />
      <Text style={{ flex: 1, color: danger ? colors.error : colors.onSurface, fontSize: 15 }}>{label}</Text>
      {right ? <Text style={{ color: colors.muted, fontSize: 13 }}>{right}</Text> : null}
    </Pressable>
  );
}

export function PromptSheet({
  visible, title, placeholder, initial = "", confirmLabel = "Save", onSubmit, onClose, testID, keyboardType, extra,
}: {
  visible: boolean; title: string; placeholder?: string; initial?: string; confirmLabel?: string; onSubmit: (v: string) => void; onClose: () => void;
  testID: string; keyboardType?: "default" | "number-pad"; extra?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <TextInput
        testID={`${testID}-input`}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        onSubmitEditing={() => value.trim() && onSubmit(value.trim())}
        style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: spacing.md, fontSize: 15 }}
      />
      {extra}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
        <Button testID={`${testID}-cancel`} label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button testID={`${testID}-confirm`} label={confirmLabel} onPress={() => value.trim() && onSubmit(value.trim())} disabled={!value.trim()} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

// ---------- Toast ----------
type ToastT = { id: number; msg: string; kind: "info" | "success" | "error" };
const ToastCtx = createContext<(msg: string, kind?: ToastT["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastT | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback((msg: string, kind: ToastT["kind"] = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), msg, kind });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const bg = toast?.kind === "error" ? colors.error : toast?.kind === "success" ? colors.success : colors.surfaceInverse;
  const fg = toast?.kind === "error" ? colors.onError : toast?.kind === "success" ? colors.onSuccess : colors.onSurfaceInverse;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(200)}
          style={[toastStyles.wrap, { top: insets.top + spacing.sm, pointerEvents: "none" }]}
        >
          <View testID="toast" style={[toastStyles.toast, { backgroundColor: bg }]}>
            <Text style={{ color: fg, fontSize: 14, fontWeight: "500" }}>{toast.msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const toastStyles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center" },
  toast: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, maxWidth: 480 },
});

export const useToast = () => useContext(ToastCtx);
