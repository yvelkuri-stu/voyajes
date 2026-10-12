import type { EventDetails } from "../lib/draftStore";
import { isoToLocalInput, localInputToIso } from "../lib/event";

/** v0.9 invitation extras: real start/end (calendar), address (maps), RSVP deadline, +1s. */
export function EventDetailsFields({ value, onChange }: { value: EventDetails; onChange: (v: EventDetails) => void }) {
  const set = (patch: Partial<EventDetails>) => {
    const next = { ...value, ...patch };
    for (const k of Object.keys(next) as (keyof EventDetails)[]) if (next[k] === undefined || next[k] === "") delete next[k];
    onChange(next);
  };
  const lbl = { fontSize: "0.72rem" } as const;
  return (
    <div className="vj-event-fields" data-event-fields>
      <label>
        <span className="muted" style={lbl}>Starts (for calendars)</span>
        <input type="datetime-local" data-event-start value={isoToLocalInput(value.eventStart)} onChange={(e) => set({ eventStart: localInputToIso(e.target.value) })} />
      </label>
      <label>
        <span className="muted" style={lbl}>Ends</span>
        <input type="datetime-local" data-event-end value={isoToLocalInput(value.eventEnd)} onChange={(e) => set({ eventEnd: localInputToIso(e.target.value) })} />
      </label>
      <label>
        <span className="muted" style={lbl}>Address or map link</span>
        <input data-event-address value={value.eventAddress ?? ""} placeholder="12 Hill Rd, Bandra — opens in Maps" onChange={(e) => set({ eventAddress: e.target.value })} />
      </label>
      <label>
        <span className="muted" style={lbl}>RSVP by</span>
        <input type="datetime-local" data-rsvp-deadline value={isoToLocalInput(value.rsvpDeadline)} onChange={(e) => set({ rsvpDeadline: localInputToIso(e.target.value) })} />
      </label>
      <label>
        <span className="muted" style={lbl}>Guests can bring</span>
        <select data-plus-ones-max value={value.plusOnesMax ?? 2} onChange={(e) => set({ plusOnesMax: Number(e.target.value) })}>
          <option value={0}>Just themselves</option>
          {[1, 2, 3, 4, 5, 10].map((n) => (
            <option key={n} value={n}>up to +{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
