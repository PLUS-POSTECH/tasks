import { classNames } from "@/lib/utilities/class-names";

type PriorityIconProps = {
  readonly priority: number;
  readonly size?: number;
  readonly className?: string;
};

export const PriorityIcon = ({
  priority,
  size = 14,
  className,
}: PriorityIconProps) => {
  if (priority === 1) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={classNames("text-warning", className)}
        aria-hidden="true"
      >
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path
          d="M8 4.2v4.6"
          stroke="white"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.6" r="1" fill="white" />
      </svg>
    );
  }

  const activeBars = priority === 0 ? 0 : 5 - priority;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={classNames("text-foreground-secondary", className)}
      aria-hidden="true"
    >
      {priority === 0 ? (
        <>
          <rect x="1.5" y="7" width="3" height="2" rx="1" fill="currentColor" opacity={0.6} />
          <rect x="6.5" y="7" width="3" height="2" rx="1" fill="currentColor" opacity={0.6} />
          <rect x="11.5" y="7" width="3" height="2" rx="1" fill="currentColor" opacity={0.6} />
        </>
      ) : (
        <>
          <rect x="1.5" y="9" width="3" height="5" rx="1" fill="currentColor" opacity={activeBars >= 1 ? 1 : 0.28} />
          <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" opacity={activeBars >= 2 ? 1 : 0.28} />
          <rect x="11.5" y="2" width="3" height="12" rx="1" fill="currentColor" opacity={activeBars >= 3 ? 1 : 0.28} />
        </>
      )}
    </svg>
  );
};
