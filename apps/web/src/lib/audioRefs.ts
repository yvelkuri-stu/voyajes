/**
 * Audio clip refs → playable URLs.
 *  - "lib:<libraryItemId>"  Voyajes free library (referenced by id — never embedded)
 *  - "<audio.beat@ver>"     catalog beat pack (referenced by id)
 *  - "custom:<id>"          user upload → caller-provided URL map (local blob or
 *                            embedded data: URL in portable links)
 */
import { getBeatByRef } from "../data/beats";
import { getLibraryItem, libraryAssetUrl } from "../data/library";

export const LIB_REF_PREFIX = "lib:";

export function isLibraryRef(ref: string): boolean {
  return ref.startsWith(LIB_REF_PREFIX);
}

export function resolveAudioRef(ref: string, custom?: Record<string, string | undefined>): string | undefined {
  if (!ref) return undefined;
  if (isLibraryRef(ref)) {
    const item = getLibraryItem(ref.slice(LIB_REF_PREFIX.length));
    return item ? libraryAssetUrl(item.url) : undefined;
  }
  if (ref.startsWith("custom:")) {
    return custom?.[ref] ?? custom?.[ref.slice("custom:".length)];
  }
  return getBeatByRef(ref)?.previewUrl;
}

export function audioRefLabel(ref: string, customNames?: Record<string, string>): string {
  if (isLibraryRef(ref)) return getLibraryItem(ref.slice(LIB_REF_PREFIX.length))?.title ?? "Library sound";
  if (ref.startsWith("custom:")) return customNames?.[ref.slice(7)] ?? "Custom sound";
  return getBeatByRef(ref)?.name ?? ref;
}
