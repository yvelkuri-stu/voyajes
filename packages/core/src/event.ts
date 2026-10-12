// v0.9 event basics shared by the Worker (OG + .ics) and the web app (#vj1 fallback).
// Pure, dependency-free.

export type Invitation = {
  eventName?: string; hostName?: string; eventType?: string; eventWhen?: string; eventWhere?: string; eventAddress?: string;
  eventStart?: string; eventEnd?: string; rsvpDeadline?: string; plusOnesMax?: number;
};

/** Invitation details live in the pack (share.playback.invitation or share.invitation). */
export function fmtWhen(inv: Invitation | null): string {
  if (!inv) return "";
  if (inv.eventWhen) return inv.eventWhen;
  if (!inv.eventStart) return "";
  const d = new Date(inv.eventStart);
  if (isNaN(+d)) return "";
  // keep the host's wall-clock time: ISO strings carry their offset; render that offset's local time
  const m = /T(\d{2}):(\d{2})/.exec(inv.eventStart);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const local = /([+-]\d{2}):?(\d{2})$|Z$/.exec(inv.eventStart);
  if (m && local) {
    const off = local[0] === "Z" ? 0 : (local[1].startsWith("-") ? -1 : 1) * (Math.abs(+local[1]) * 60 + +local[2]);
    const wall = new Date(+d + off * 60_000);
    const dd = wall.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const h = wall.getUTCHours(), mi = wall.getUTCMinutes();
    return `${dd} · ${((h + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }
  return day;
}

/** ISO (with offset) → iCalendar UTC basic format */
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
const fold = (line: string) => {
  const out: string[] = [];
  let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
  out.push(s);
  return out.join("\r\n");
};
export function eventTimes(inv: Invitation | null): { start: string; end: string } | null {
  if (!inv?.eventStart || isNaN(+new Date(inv.eventStart))) return null;
  const end = inv.eventEnd && +new Date(inv.eventEnd) > +new Date(inv.eventStart) ? inv.eventEnd : new Date(+new Date(inv.eventStart) + 3 * 3600_000).toISOString();
  return { start: inv.eventStart, end };
}
export function buildIcs(o: { uid: string; title: string; inv: Invitation; url: string; now?: number }): string | null {
  const t = eventTimes(o.inv);
  if (!t) return null;
  const where = [o.inv.eventWhere, o.inv.eventAddress].filter(Boolean).join(", ");
  const desc = [o.inv.hostName ? `Hosted by ${o.inv.hostName}` : "", `RSVP: ${o.url}`].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Voyajes//One Link//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${o.uid}@voyajes`,
    `DTSTAMP:${icsDate(new Date(o.now ?? Date.now()).toISOString())}`,
    `DTSTART:${icsDate(t.start)}`,
    `DTEND:${icsDate(t.end)}`,
    `SUMMARY:${icsText(o.title)}`,
    where ? `LOCATION:${icsText(where)}` : "",
    `DESCRIPTION:${icsText(desc)}`,
    `URL:${o.url}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "TRIGGER:-PT2H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}


export function googleCalendarUrl(o: { title: string; inv: Invitation; url?: string }): string | null {
  const t = eventTimes(o.inv);
  if (!t) return null;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: o.title,
    dates: `${icsDate(t.start)}/${icsDate(t.end)}`,
    details: [o.inv.hostName ? `Hosted by ${o.inv.hostName}` : "", o.url ? `RSVP: ${o.url}` : ""].filter(Boolean).join("\n"),
    location: [o.inv.eventWhere, o.inv.eventAddress].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
export function mapsUrl(inv: Invitation | null | undefined): string | null {
  const q = [inv?.eventWhere, inv?.eventAddress].filter(Boolean).join(", ").trim();
  if (!q) return null;
  if (/^https?:\/\//.test(inv?.eventAddress ?? "")) return inv!.eventAddress!;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
