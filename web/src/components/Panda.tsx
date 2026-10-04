// A small panda face in the app's navy and white
export function PandaFace({ size = 40 }: { size?: number }) {
  const ink = "#0b1b33";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="15" cy="16" r="9" fill={ink} />
      <circle cx="49" cy="16" r="9" fill={ink} />
      <circle cx="32" cy="35" r="24" fill="#fff" stroke={ink} strokeWidth="2.5" />
      <ellipse cx="22" cy="33" rx="6.5" ry="8.5" transform="rotate(-25 22 33)" fill={ink} />
      <ellipse cx="42" cy="33" rx="6.5" ry="8.5" transform="rotate(25 42 33)" fill={ink} />
      <circle cx="23" cy="32" r="2.4" fill="#fff" />
      <circle cx="41" cy="32" r="2.4" fill="#fff" />
      <ellipse cx="32" cy="43" rx="4" ry="2.8" fill={ink} />
      <path d="M28 48 q4 3.2 8 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
