type Props = { size?: number; withWordmark?: boolean };

export function Logo({ size = 28, withWordmark = true }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "Sora, sans-serif",
        fontWeight: 700,
        fontSize: size * 0.55,
        letterSpacing: "-0.03em",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="vj-g" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#E84AFF" />
            <stop offset="0.5" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#3DDC97" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#vj-g)" />
        <path
          d="M8 26c4-10 8-14 12-14s8 4 12 14"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.95"
        />
        <circle cx="20" cy="14" r="2.5" fill="#F5C542" />
      </svg>
      {withWordmark && <span>Voyajes</span>}
    </span>
  );
}
