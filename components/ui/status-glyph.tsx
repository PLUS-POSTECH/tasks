export type StatusGlyphShape = "dashed" | "outline" | "progress" | "paused" | "done" | "canceled";

type StatusGlyphProps = {
  readonly shape: StatusGlyphShape;
  readonly color: string;
  /** 0..1 fill for the progress shape. */
  readonly progress?: number;
  readonly size?: number;
  readonly className?: string;
};

const center = 7;
const radius = 5.5;

const arcPath = (progress: number): string => {
  const clamped = Math.min(Math.max(progress, 0.02), 0.98);
  const endAngle = clamped * 2 * Math.PI - Math.PI / 2;
  const endX = center + 3.2 * Math.cos(endAngle);
  const endY = center + 3.2 * Math.sin(endAngle);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${center} ${center} L ${center} ${center - 3.2} A 3.2 3.2 0 ${largeArc} 1 ${endX} ${endY} Z`;
};

export const StatusGlyph = ({ shape, color, progress = 0.5, size = 14, className }: StatusGlyphProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" className={className} aria-hidden="true">
    {shape === "dashed" ? (
      <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="1.8 1.6" />
    ) : shape === "outline" ? (
      <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={1.5} />
    ) : shape === "progress" ? (
      <>
        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={1.5} />
        <path d={arcPath(progress)} fill={color} />
      </>
    ) : shape === "paused" ? (
      <>
        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={1.5} />
        <rect x="4.6" y="4.4" width="1.6" height="5.2" rx="0.5" fill={color} />
        <rect x="7.8" y="4.4" width="1.6" height="5.2" rx="0.5" fill={color} />
      </>
    ) : shape === "done" ? (
      <>
        <circle cx={center} cy={center} r={radius + 0.5} fill={color} />
        <path d="M4.4 7.2 6.3 9.1 9.8 5.4" fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <>
        <circle cx={center} cy={center} r={radius + 0.5} fill={color} />
        <path d="M4.8 4.8 9.2 9.2M9.2 4.8 4.8 9.2" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
      </>
    )}
  </svg>
);
