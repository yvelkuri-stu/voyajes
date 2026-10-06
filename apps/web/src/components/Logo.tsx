import { assetUrl } from "../lib/assetUrl";

type Props = {
  size?: number;
  withWordmark?: boolean;
  /** Prefer app V mark (default) or alt spark circle. */
  variant?: "app" | "alt";
};

/** Brand wordmark with a subtle intentional J accent (weight + soft tint). */
export function Wordmark({ fontSize }: { fontSize: number }) {
  return (
    <span className="vj-wordmark" style={{ fontSize }}>
      Voya
      <span className="vj-wordmark-j" aria-label="j">
        j
        <span className="vj-wordmark-j-spark" aria-hidden />
      </span>
      es
    </span>
  );
}

export function Logo({
  size = 28,
  withWordmark = true,
  variant = "app",
}: Props) {
  const src =
    assetUrl(
      variant === "alt" ? "/brand/logo-alt.png" : "/brand/logo-app.png",
    ) ?? "/brand/logo-app.png";

  return (
    <span
      className="vj-logo"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "Sora, sans-serif",
        fontWeight: 700,
        letterSpacing: "-0.03em",
      }}
    >
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        aria-hidden
        className="vj-logo-mark"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(6, Math.round(size * 0.28)),
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
        }}
        draggable={false}
      />
      {withWordmark && <Wordmark fontSize={size * 0.55} />}
    </span>
  );
}
