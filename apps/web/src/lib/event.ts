import { buildIcs, googleCalendarUrl, mapsUrl, type Invitation } from "@voyajes/core";
import { API_BASE, isCloudId } from "./api";

/** datetime-local value ("2026-10-11T19:30") → ISO with this device's offset */
export function localInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (isNaN(+d)) return undefined;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${v.length === 16 ? v + ":00" : v}${sign}${hh}:${mm}`;
}
/** ISO → datetime-local value in this device's zone */
export function isoToLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type EventLinks = { ics: string | null; icsIsBlob: boolean; google: string | null; maps: string | null };

/** Calendar + maps links. Cloud voyages use the Worker's .ics; #vj1 links build one locally. */
export function eventLinks(inv: Invitation | null | undefined, opts: { title: string; id?: string; url?: string }): EventLinks {
  if (!inv) return { ics: null, icsIsBlob: false, google: null, maps: null };
  const google = googleCalendarUrl({ title: opts.title, inv, url: opts.url });
  let ics: string | null = null;
  let icsIsBlob = false;
  if (google) {
    if (opts.id && isCloudId(opts.id) && API_BASE) ics = `${API_BASE}/voyages/${opts.id}/event.ics`;
    else {
      const text = buildIcs({ uid: opts.id ?? "local", title: opts.title, inv, url: opts.url ?? location.href });
      if (text) {
        ics = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
        icsIsBlob = true;
      }
    }
  }
  return { ics, icsIsBlob, google, maps: mapsUrl(inv) };
}
