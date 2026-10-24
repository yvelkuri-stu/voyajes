import { Link } from "react-router-dom";
import { getAllTracks } from "../data/beats";
import { AUDIO_CATEGORIES, LIBRARY_VERSION } from "../data/library";
import "../styles/audio-browser.css";

const LIC_URL: Record<string, string> = {
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
};

/** In-app credits for every bundled sound (v1.3). Mirrors public/library/LIBRARY.md. */
export function Credits() {
  const tracks = getAllTracks();
  const catLabel = Object.fromEntries(AUDIO_CATEGORIES.map((c) => [c.id, `${c.emoji} ${c.label}`]));
  const byAuthors = [...new Set(tracks.filter((t) => (t.credit?.license ?? "CC BY").startsWith("CC BY")).map((t) => t.credit?.author ?? "Kevin MacLeod (incompetech.com)"))];
  return (
    <article className="vj-legal vj-credits" data-credits>
      <h1>Sound credits</h1>
      <p className="muted">
        Voyajes ships {tracks.length} real recordings — Indian ceremony instruments, lullabies, songs and sound effects — all under
        CC0, public domain or CC BY. No AI or synthesized stand-ins, nothing non-commercial or ripped. Library {LIBRARY_VERSION}.
      </p>
      <p>
        <strong>Posting a video?</strong> If it uses a <em>CC BY</em> track, add its credit line to your caption — tap the licence badge in the
        sound browser to copy it. CC0 and public-domain sounds need no credit (it is still nice).
      </p>
      <table>
        <thead>
          <tr>
            <th>Sound</th>
            <th className="vj-cr-hide-sm">Category</th>
            <th>Original work · author</th>
            <th>Licence</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t) => {
            const c = t.credit;
            const lic = c?.license ?? "CC BY 3.0";
            return (
              <tr key={t.packRef} data-credit-row={t.packRef}>
                <td>
                  <strong>{t.name}</strong>
                  {c?.note && <div className="muted" style={{ fontSize: ".72rem" }}>{c.note}</div>}
                </td>
                <td className="vj-cr-hide-sm">
                  <span className="vj-cr-cat" style={{ ["--cat" as string]: "linear-gradient(135deg,#ffd166,#ff5ec4)" }}>
                    {catLabel[t.category ?? "chill"] ?? t.category}
                  </span>
                </td>
                <td>
                  {c ? (
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                      {c.work}
                    </a>
                  ) : (
                    t.attribution
                  )}
                  <div className="muted" style={{ fontSize: ".75rem" }}>{c?.author ?? "Kevin MacLeod (incompetech.com)"}</div>
                </td>
                <td>
                  <a href={c?.licenseUrl ?? LIC_URL[lic] ?? "#"} target="_blank" rel="noreferrer" data-credit-license>
                    {lic}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Attribution</h2>
      <p>CC BY works by: {byAuthors.join(", ")}.</p>
      <p>
        Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 3.0 —{" "}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
          creativecommons.org/licenses/by/3.0
        </a>
      </p>
      <p className="muted">
        Recordings were cut into seamless loops, loudness-normalised (−14 LUFS) and re-encoded by Voyajes; no other changes. See also{" "}
        <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>.
      </p>
    </article>
  );
}
