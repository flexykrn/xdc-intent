interface XDCLogoProps {
  className?: string;
  size?: number;
}

export default function XDCLogo({ className = "", size = 32 }: XDCLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="10" fill="var(--ink)" />
      <path
        d="M10 10L16 16M16 16L22 22M16 16L22 10M16 16L10 22"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
