import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Voyajes store apps. App id is configurable: VOYAJES_APP_ID=com.you.voyajes pnpm sync
 * (must match the id you register in App Store Connect / Play Console; it can never change after first upload).
 */
const config: CapacitorConfig = {
  appId: process.env.VOYAJES_APP_ID || "app.voyajes",
  appName: process.env.VOYAJES_APP_NAME || "Voyajes",
  webDir: "www",
  backgroundColor: "#0B0D12",
  android: { allowMixedContent: false },
  ios: { contentInset: "never", scheme: "Voyajes" },
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: "#0B0D12", showSpinner: false, androidScaleType: "CENTER_CROP" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;
