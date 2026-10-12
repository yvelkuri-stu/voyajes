import { useEffect, useMemo } from "react";
import type { Invitation } from "@voyajes/core";
import { eventLinks } from "../lib/event";

/** Add to calendar (.ics + Google) and Directions, for invitations. */
export function EventActions({ inv, title, id, url }: { inv?: Invitation | null; title: string; id?: string; url?: string }) {
  const links = useMemo(() => eventLinks(inv, { title, id, url }), [inv, title, id, url]);
  useEffect(() => () => void (links.icsIsBlob && links.ics && URL.revokeObjectURL(links.ics)), [links]);
  if (!links.ics && !links.google && !links.maps) return null;
  return (
    <div className="vj-event-actions" data-event-actions>
      {links.ics && (
        <a className="btn btn-ghost vj-small" href={links.ics} download={`${(title || "event").replace(/[^\w-]+/g, "-")}.ics`} data-add-ics>
          📅 Add to calendar
        </a>
      )}
      {links.google && (
        <a className="btn btn-ghost vj-small" href={links.google} target="_blank" rel="noopener noreferrer" data-add-gcal>
          Google Calendar
        </a>
      )}
      {links.maps && (
        <a className="btn btn-ghost vj-small" href={links.maps} target="_blank" rel="noopener noreferrer" data-maps>
          📍 Directions
        </a>
      )}
    </div>
  );
}
