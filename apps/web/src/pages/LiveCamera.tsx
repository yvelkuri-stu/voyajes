import { isNative, nativePhoto } from "../lib/native";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { dropFile, fetchVoyage, isCloudId, type CloudVoyage } from "../lib/api";
import { NotifyButton, VoteStrip, useLiveWall } from "../components/AfterMovie";
import "../styles/aftermovie.css";

/** v1.0 live party camera: guests open it from the QR card, snap, and it lands on the TV + in the after-movie. */
export function LiveCamera() {
  const { id = "" } = useParams();
  const [v, setV] = useState<CloudVoyage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem("voyajes.guestName") ?? "");
  const [cam, setCam] = useState<"off" | "on" | "denied">("off");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [flash, setFlash] = useState(0);
  const [sent, setSent] = useState<{ n: number; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { wall, setWall, reload } = useLiveWall(id, 6000);

  useEffect(() => {
    if (!isCloudId(id)) return setErr("This party camera link looks mistyped.");
    fetchVoyage(id).then(setV, () => setErr("Can't reach this party right now."));
  }, [id]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const startCam = async (face = facing) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => undefined);
      }
      setCam("on");
    } catch {
      setCam("denied");
    }
  };
  const send = async (file: File) => {
    setBusy(true);
    try {
      if (name.trim()) localStorage.setItem("voyajes.guestName", name.trim());
      await dropFile(id, file, name.trim() || undefined, "live");
      setSent((s) => ({ n: (s?.n ?? 0) + 1, msg: "On the big screen ✨" }));
      await reload();
    } catch (e) {
      setSent((s) => ({ n: s?.n ?? 0, msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };
  const snap = () => {
    const vid = videoRef.current;
    if (!vid || !vid.videoWidth) return fileRef.current?.click();
    const c = document.createElement("canvas");
    c.width = vid.videoWidth;
    c.height = vid.videoHeight;
    const x = c.getContext("2d")!;
    if (facing === "user") {
      x.translate(c.width, 0);
      x.scale(-1, 1);
    }
    x.drawImage(vid, 0, 0);
    setFlash((f) => f + 1);
    navigator.vibrate?.(30);
    c.toBlob((b) => b && void send(new File([b], `live-${Date.now()}.jpg`, { type: "image/jpeg" })), "image/jpeg", 0.88);
  };

  const accent = v?.pack.share.themeAccent || "#ff4d8d";
  const grad = v?.pack.share.themeGradient || "linear-gradient(135deg,#ff4d8d,#7c5cff)";
  const title = v?.pack.share.invitation?.eventName || v?.title || "Party";
  if (err) return <main className="am-cam-page"><p className="am-cam-err">{err}</p></main>;
  return (
    <main className="am-cam-page" style={{ ["--am-accent" as string]: accent, ["--am-grad" as string]: grad }} data-party-camera>
      <header className="am-cam-top">
        <Link to={`/v/${id}`} className="am-cam-back" aria-label="Back to the party">‹</Link>
        <div>
          <span className="am-chip am-chip-live">● Live</span>
          <h1 className="am-cam-title">{title}</h1>
        </div>
        <span className="am-cam-count" data-live-count>{wall?.drops.length ?? 0} 📸</span>
      </header>

      {wall?.aftermovieAt && (
        <Link className="am-banner" to={`/v/${id}?aftermovie=1`} data-aftermovie-banner>
          🎬 The after-movie is out — watch it
        </Link>
      )}

      <div className="am-viewfinder">
        <video ref={videoRef} playsInline muted className={facing === "user" ? "is-mirror" : ""} hidden={cam !== "on"} />
        {cam !== "on" && (
          <button type="button" className="am-cam-start" onClick={() => void startCam()} data-start-camera>
            <span className="am-cam-lens" aria-hidden />
            {cam === "denied" ? "Camera blocked — tap the shutter to pick a photo" : "Tap to open the camera"}
          </button>
        )}
        {flash > 0 && <div key={flash} className="am-flash" aria-hidden />}
        {sent && <div key={`s${sent.n}${sent.msg}`} className="am-sent" role="status" data-live-sent>{sent.msg}</div>}
      </div>

      <div className="am-controls">
        <input className="am-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={40} data-live-name />
        <button type="button" className="am-shutter" aria-label="Take photo" disabled={busy} onClick={snap} data-shutter>
          <span />
        </button>
        <button
          type="button"
          className="am-flip"
          aria-label="Flip camera"
          disabled={cam !== "on"}
          onClick={() => {
            const f = facing === "user" ? "environment" : "user";
            setFacing(f);
            void startCam(f);
          }}
        >
          ⟲
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          hidden
          data-live-file
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f);
            e.target.value = "";
          }}
        />
      </div>
      <button
        type="button"
        className="am-roll-btn"
        onClick={async () => {
          // native store apps: system photo picker; web: file input
          if (isNative()) {
            const f = await nativePhoto("photos");
            if (f) void send(f);
            return;
          }
          fileRef.current?.click();
        }}
      >
        or pick from your camera roll
      </button>
      <p className="am-terms" data-terms-note>
        Photos go to the host's party wall. By posting you agree to the <Link to="/terms">Terms</Link>.
      </p>

      {wall && (
        <section className="am-cam-wall" aria-label="Vote the cut">
          <p className="am-sub">Vote the cut · 🔥 the moments you love</p>
          <VoteStrip cloudId={id} wall={wall} onChange={setWall} />
          <NotifyButton cloudId={id} title={title} />
        </section>
      )}
    </main>
  );
}
