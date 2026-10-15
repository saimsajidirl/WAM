import { useId } from "react";

/** WAM mark — black rounded tile with a white "W" monogram. */
export function LogoMark({ size = 16 }: { size?: number }) {
  const gid = `wam${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#303038" />
          <stop offset="100%" stopColor="#000002" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${gid})`} />
      <path
        d="M26 30 L39.5 70 L50 40 L60.5 70 L74 30"
        fill="none"
        stroke="#fff"
        strokeWidth="8.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
