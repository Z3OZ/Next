import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { LogBox, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/ui";
import { StoreProvider } from "@/src/lib/store";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function ThemedStack() {
  const { colors, scheme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="editor" />
        <Stack.Screen name="history" options={{ presentation: "modal" }} />
        <Stack.Screen name="check" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="compare" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  // Prewarm icon + mono fonts so icons render in Expo Go.
  const [loaded] = useFonts({
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  if (!loaded) return null;
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <StoreProvider>
              <ToastProvider>
                <ThemedStack />
              </ToastProvider>
            </StoreProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
