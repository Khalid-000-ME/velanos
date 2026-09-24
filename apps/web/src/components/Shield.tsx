/** The wordmark glyph: a shield with a green fill, used in the header and as the favicon source. */
export function Shield({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2.5 4.5 5.4v6.2c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10V5.4L12 2.5Z"
        fill="var(--green)"
      />
      <path
        d="m8.6 12.1 2.4 2.4 4.4-4.5"
        stroke="#000"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
