/** Resolve a catalog/public path against Vite's base (e.g. /voyajes/ on Pages). */
export function assetUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  const base = import.meta.env.BASE_URL || "/";
  const cleaned = path.replace(/^\//, "");
  return `${base}${cleaned}`;
}
