/** Animated sample preview for a template card (crossfading Ken Burns thumbs). */
import { samplePreviewUrls } from "../data/samples";

export function SamplePreview({ templateId, label }: { templateId: string; label?: string }) {
  const urls = samplePreviewUrls(templateId);
  if (!urls.length) return null;
  const per = 1.6;
  return (
    <div className="vj-sample-preview" aria-hidden style={{ ["--n" as string]: urls.length }}>
      {urls.map((u, i) => (
        <img
          key={u}
          src={u}
          alt=""
          loading="lazy"
          draggable={false}
          style={{ animationDelay: `${i * per}s`, animationDuration: `${urls.length * per}s` }}
        />
      ))}
      {label && <span className="vj-sample-preview-label">{label}</span>}
    </div>
  );
}
