/**
 * Public web address used in links we hand to other people.
 * In the browser this is just origin + base. Inside the native store apps (Capacitor serves from
 * https://localhost) the build sets VITE_PUBLIC_URL so shared links still point at the real site.
 * Switch to a custom domain later by changing VITE_PUBLIC_URL (see docs/store/LAUNCH.md).
 */
export function publicBase(): string {
  const env = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, "");
  if (env) return env;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}`;
}
