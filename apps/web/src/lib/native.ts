/**
 * Native bridge for the Capacitor store apps. On the web every function falls back to the browser API,
 * and plugin code is only loaded (dynamic import) inside the native shell.
 */
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"

/** Haptic tap (native Taptic/vibrator; navigator.vibrate on the web). */
export function haptic(ms = 12) {
  if (!isNative()) {
    navigator.vibrate?.(ms);
    return;
  }
  void import("@capacitor/haptics").then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ms >= 25 ? ImpactStyle.Medium : ImpactStyle.Light })).catch(() => {});
}

const toB64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/** Native share sheet with a real file (video/GIF/PNG). Returns false if not native or it failed. */
export async function nativeShareFile(blob: Blob, name: string, title: string): Promise<"shared" | "cancelled" | false> {
  if (!isNative()) return false;
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const w = await Filesystem.writeFile({ path: `share/${name}`, data: await toB64(blob), directory: Directory.Cache, recursive: true });
    await Share.share({ title, files: [w.uri], dialogTitle: title });
    return "shared";
  } catch (e) {
    return /cancel/i.test(String((e as Error)?.message)) ? "cancelled" : false;
  }
}

export async function nativeShareLink(o: { title: string; text: string; url: string }): Promise<"shared" | "cancelled" | false> {
  if (!isNative()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: o.title, text: o.text, url: o.url, dialogTitle: o.title });
    return "shared";
  } catch (e) {
    return /cancel/i.test(String((e as Error)?.message)) ? "cancelled" : false;
  }
}

/** Native camera / photo library → File (party camera fallback, imports). null on web or cancel. */
export async function nativePhoto(source: "camera" | "photos" = "camera"): Promise<File | null> {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const p = await Camera.getPhoto({ resultType: CameraResultType.Uri, source: source === "camera" ? CameraSource.Camera : CameraSource.Photos, quality: 88, correctOrientation: true });
    if (!p.webPath) return null;
    const blob = await (await fetch(p.webPath)).blob();
    return new File([blob], `voyajes-${Date.now()}.${p.format || "jpg"}`, { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}

/**
 * Native push registration. Needs Firebase (google-services.json) on Android and an APNs key on iOS —
 * see docs/store/LAUNCH.md. Until then this resolves null and the in-app inbox keeps working.
 */
export async function nativePushToken(): Promise<string | null> {
  // Calling register() without Firebase configured crashes Android, so it's opt-in at build time.
  if (!isNative() || import.meta.env.VITE_NATIVE_PUSH !== "1") return null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return null;
    return await new Promise<string | null>((res) => {
      const t = setTimeout(() => res(null), 8000);
      void PushNotifications.addListener("registration", (tok) => { clearTimeout(t); res(tok.value); });
      void PushNotifications.addListener("registrationError", () => { clearTimeout(t); res(null); });
      void PushNotifications.register();
    });
  } catch {
    return null;
  }
}

/** One-time native shell setup: status bar colour, hide splash, Android back button = history back. */
export async function initNative() {
  if (!isNative()) return;
  document.documentElement.classList.add("is-native", `is-${platform()}`);
  // Route every existing navigator.share / navigator.vibrate call through the native plugins
  // (Android's WebView has no Web Share; iOS gets the Taptic engine instead of nothing).
  const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
  nav.vibrate = ((p: number | number[]) => (haptic(Array.isArray(p) ? p[0] : p), true)) as Navigator["vibrate"];
  nav.canShare = () => true;
  nav.share = async (d?: ShareData) => {
    const f = d?.files?.[0];
    const r = f ? await nativeShareFile(f, f.name, d?.title ?? "Voyajes") : await nativeShareLink({ title: d?.title ?? "Voyajes", text: d?.text ?? "", url: d?.url ?? "" });
    if (r === "cancelled") throw new DOMException("cancelled", "AbortError");
    if (!r) throw new DOMException("share failed", "NotAllowedError");
  };
  try {
    const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([import("@capacitor/status-bar"), import("@capacitor/splash-screen"), import("@capacitor/app")]);
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    if (platform() === "android") await StatusBar.setBackgroundColor({ color: "#0B0D12" }).catch(() => {});
    void App.addListener("backButton", ({ canGoBack }) => (canGoBack ? history.back() : App.exitApp()));
    // Open shared web links (https://…/voyajes/v/…) inside the app
    void App.addListener("appUrlOpen", ({ url }) => {
      const u = new URL(url);
      const p = u.pathname.replace(/^\/voyajes(?=\/)/, "");
      if (/^\/(v|i|live|tv|year)\b/.test(p)) location.assign(p + u.search);
    });
    setTimeout(() => void SplashScreen.hide(), 300);
  } catch {
    /* plugin missing: fine */
  }
}
