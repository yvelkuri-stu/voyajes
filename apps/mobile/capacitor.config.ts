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
    // v1.2.1 true screen layouts: draw edge-to-edge and hand real WindowInsets (status bar, gesture/nav bar,
    // display cutout) to CSS as --safe-area-inset-* — Android WebView < 140 reports env(safe-area-inset-*) as 0.
    SystemBars: { insetsHandling: "css", style: "DARK", initialViewportFitValueHint: "cover" },
    StatusBar: { overlaysWebView: true, style: "DARK", backgroundColor: "#00000000" },
    SplashScreen: { launchShowDuration: 1200, backgroundColor: "#0B0D12", showSpinner: false, androidScaleType: "CENTER_CROP" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;
