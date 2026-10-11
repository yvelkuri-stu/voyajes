import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  getLibraryItems,
  libraryAssetUrl,
  libraryTags,
  type LibraryItem,
  type LibraryKind,
} from "../data/library";

export type MediaImporterMode = "clips" | "audio" | "all";

type Props = {
  open: boolean;
  onClose: () => void;
  mode?: MediaImporterMode;
  /** Local device files (images/video and/or audio depending on mode). */
  onImportFiles: (files: FileList | File[]) => void;
  /** Insert a Voyajes library item (photo → timeline, audio → soundtrack). */
  onInsertLibrary: (item: LibraryItem) => void;
  /** Optional remote audio URL (when mode includes audio). */
  onImportAudioUrl?: (url: string) => void;
};

export function MediaImporter({
  open,
  onClose,
  mode = "all",
  onImportFiles,
  onInsertLibrary,
  onImportAudioUrl,
}: Props) {
  const [tab, setTab] = useState<"device" | "library" | "url">("device");
  const [kindFilter, setKindFilter] = useState<LibraryKind | "all">(
    mode === "audio" ? "audio" : mode === "clips" ? "photo" : "all",
  );
  const [tag, setTag] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // v0.6: multi-select staging — sort by date/name, tap to drop, then add
  const [staged, setStaged] = useState<{ file: File; url: string; off: boolean }[] | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [dragging, setDragging] = useState(false);

  const tags = useMemo(() => libraryTags(), []);
  const items = useMemo(() => {
    let list =
      kindFilter === "all" ? getLibraryItems() : getLibraryItems(kindFilter);
    if (mode === "clips") list = list.filter((i) => i.kind === "photo" || i.kind === "video");
    if (mode === "audio") list = list.filter((i) => i.kind === "audio");
    if (tag) list = list.filter((i) => i.tags.includes(tag));
    return list;
  }, [kindFilter, tag, mode]);

  if (!open) return null;

  const stage = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length <= 1 || mode === "audio") {
      onImportFiles(list);
      onClose();
      return;
    }
    setStaged(list.map((file) => ({ file, url: URL.createObjectURL(file), off: false })));
  };
  const sortedStage = staged
    ? [...staged].sort((a, b) =>
        sortBy === "name"
          ? a.file.name.localeCompare(b.file.name, undefined, { numeric: true })
          : a.file.lastModified - b.file.lastModified,
      )
    : [];
  const commitStage = () => {
    const pick = sortedStage.filter((x) => !x.off).map((x) => x.file);
    staged?.forEach((x) => URL.revokeObjectURL(x.url));
    setStaged(null);
    if (pick.length) onImportFiles(pick);
    onClose();
  };

  const accept =
    mode === "audio"
      ? "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/ogg,audio/aac,.mp3,.wav,.m4a,.ogg"
      : mode === "clips"
        ? "image/*,video/mp4,video/webm,video/quicktime,.mov,.m4v"
        : "image/*,video/mp4,video/webm,video/quicktime,.mov,.m4v,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.m4a";

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) stage(Array.from(e.target.files));
    e.target.value = "";
  };

  return (
    <div
      className="media-importer-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="media-importer-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add media"
      >
        <header className="media-importer-head">
          <div>
            <h2 className="display" style={{ margin: 0, fontSize: "1.15rem" }}>
              Add media
            </h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.8rem" }}>
              From your device or the Voyajes free library
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </header>

        <div className="media-importer-tabs" role="tablist" aria-label="Media source">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "device"}
            className={tab === "device" ? "is-active" : undefined}
            onClick={() => setTab("device")}
          >
            📁 From device
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "library"}
            className={tab === "library" ? "is-active" : undefined}
            onClick={() => setTab("library")}
          >
            ✨ Voyajes library
          </button>
          {(mode === "audio" || mode === "all") && onImportAudioUrl && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "url"}
              className={tab === "url" ? "is-active" : undefined}
              onClick={() => setTab("url")}
            >
              🔗 URL
            </button>
          )}
        </div>

        {tab === "device" && staged && (
          <div className="media-importer-body" data-stage>
            <div className="vj-stage-bar">
              <span>
                <strong>{staged.filter((x) => !x.off).length}</strong> of {staged.length} selected · tap to remove
              </span>
              <span className="vj-stage-sort" role="group" aria-label="Sort">
                <button type="button" className={`chip${sortBy === "date" ? " chip-active" : ""}`} onClick={() => setSortBy("date")}>
                  Date
                </button>
                <button type="button" className={`chip${sortBy === "name" ? " chip-active" : ""}`} onClick={() => setSortBy("name")}>
                  Name
                </button>
              </span>
            </div>
            <div className="vj-stage-grid">
              {sortedStage.map((x) => (
                <button
                  key={x.url}
                  type="button"
                  className={`vj-stage-item${x.off ? " is-off" : ""}`}
                  aria-pressed={!x.off}
                  title={x.file.name}
                  onClick={() => setStaged((st) => st!.map((y) => (y === x ? { ...y, off: !y.off } : y)))}
                >
                  {x.file.type.startsWith("video/") ? (
                    <video src={x.url} muted playsInline preload="metadata" />
                  ) : (
                    <img src={x.url} alt="" loading="lazy" />
                  )}
                  <span className="vj-stage-x" aria-hidden>{x.off ? "＋" : "✕"}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              data-stage-add
              style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
              disabled={!staged.some((x) => !x.off)}
              onClick={commitStage}
            >
              Add {staged.filter((x) => !x.off).length}
            </button>
          </div>
        )}

        {tab === "device" && !staged && (
          <div
            className={`media-importer-body${dragging ? " is-drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) stage(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              multiple
              hidden
              onChange={onFile}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => fileRef.current?.click()}
            >
              {mode === "audio"
                ? "Choose audio files"
                : mode === "clips"
                  ? "Choose photos & video"
                  : "Choose files"}
            </button>
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: 12, textAlign: "center" }}>
              {mode === "audio"
                ? "MP3, WAV, M4A, OGG — added as soundtrack"
                : "JPG, PNG, WebP, MP4, WebM — added to the timeline"}
            </p>
            <div className="media-importer-empty">
              <span aria-hidden>🖼️</span>
              <p>Nothing selected yet — pick several at once (or drop them here). You can sort and remove before adding.</p>
            </div>
          </div>
        )}

        {tab === "library" && (
          <div className="media-importer-body">
            <div className="media-importer-filters">
              {(mode === "all"
                ? (["all", "photo", "audio"] as const)
                : mode === "clips"
                  ? (["photo"] as const)
                  : (["audio"] as const)
              ).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip${kindFilter === k ? " chip-active" : ""}`}
                  onClick={() => setKindFilter(k === "photo" || k === "audio" ? k : "all")}
                >
                  {k === "all" ? "All" : k === "photo" ? "Photos" : "Audio"}
                </button>
              ))}
            </div>
            <div className="media-importer-filters" style={{ marginTop: 8 }}>
              <button
                type="button"
                className={`chip${!tag ? " chip-active" : ""}`}
                onClick={() => setTag(null)}
              >
                Any tag
              </button>
              {tags.slice(0, 14).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${tag === t ? " chip-active" : ""}`}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {items.length === 0 ? (
              <div className="media-importer-empty">
                <p>No library items match this filter.</p>
              </div>
            ) : (
              <div className="media-library-grid">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="media-library-card"
                    title={`Insert ${item.title}`}
                    aria-label={`Insert ${item.title}`}
                    onClick={() => {
                      onInsertLibrary(item);
                      onClose();
                    }}
                  >
                    {item.kind === "audio" ? (
                      <div className="media-library-audio-thumb" aria-hidden>
                        ♪
                      </div>
                    ) : (
                      <img
                        src={libraryAssetUrl(item.thumbnail || item.url)}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    )}
                    <span className="media-library-title">{item.title}</span>
                    <span className="muted media-library-meta">
                      {item.kind}
                      {item.tags[0] ? ` · ${item.tags[0]}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "url" && onImportAudioUrl && (
          <div className="media-importer-body">
            <label className="muted" style={{ fontSize: "0.8rem", display: "block", marginBottom: 6 }}>
              Audio URL
            </label>
            <div className="comment-compose-row">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://…"
                aria-label="Audio URL"
                style={{
                  flex: 1,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  padding: "10px 12px",
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const u = urlInput.trim();
                  if (!u) return;
                  onImportAudioUrl(u);
                  setUrlInput("");
                  onClose();
                }}
              >
                Add
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 10 }}>
              Remote hosts often block browser fetch (CORS). Prefer device upload or the Voyajes library.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
