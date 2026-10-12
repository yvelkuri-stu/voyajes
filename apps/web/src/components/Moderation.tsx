import { useState } from "react";
import { Link } from "react-router-dom";
import { report, type ReportReason } from "../lib/api";
import { CONTACT } from "../lib/legal";

const REASONS: [ReportReason, string][] = [
  ["spam", "Spam or scam"],
  ["nudity", "Nudity or sexual content"],
  ["harassment", "Bullying or harassment"],
  ["hate", "Hate speech"],
  ["violence", "Violence or danger"],
  ["other", "Something else"],
];

export type ReportTarget = { targetType: "voyage" | "comment" | "drop" | "clip"; targetId?: string; label: string };

/** Report sheet (store-ready UGC): reasons → POST /report; host + owner review within 24h. */
export function ReportSheet({ cloudId, target, onClose }: { cloudId: string; target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  return (
    <div className="vj-sheet-backdrop" role="dialog" aria-modal aria-label="Report" onClick={onClose} data-report-sheet>
      <div className="vj-sheet" onClick={(e) => e.stopPropagation()}>
        {state === "done" ? (
          <>
            <h3>Thanks — we got it</h3>
            <p className="muted vj-small-text" data-report-done>
              The host has been notified and Voyajes reviews reports within 24 hours. Content that breaks our{" "}
              <Link to="/terms">terms</Link> is removed.
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <h3>Report {target.label}</h3>
            <div className="vj-report-reasons">
              {REASONS.map(([r, l]) => (
                <button key={r} type="button" data-report-reason={r} className={`chip${reason === r ? " chip-active" : ""}`} onClick={() => setReason(r)}>
                  {l}
                </button>
              ))}
            </div>
            <textarea className="vj-input" rows={2} maxLength={500} placeholder="Anything else? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {state !== "idle" && state !== "busy" && <p className="muted vj-cloud-err">{state}</p>}
            <div className="vj-sheet-row">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                data-report-submit
                disabled={!reason || state === "busy"}
                onClick={() => {
                  setState("busy");
                  report(cloudId, { targetType: target.targetType, targetId: target.targetId, reason: reason!, note: note.trim() || undefined })
                    .then(() => setState("done"))
                    .catch((e) => setState((e as Error).message));
                }}
              >
                Send report
              </button>
            </div>
            <p className="muted vj-small-text">
              Urgent? Email <a href={CONTACT.href}>{CONTACT.label}</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
