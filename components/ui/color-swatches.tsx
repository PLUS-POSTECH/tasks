import { classNames } from "@/lib/utilities/class-names";

export type ColorSwatchSize = 12 | 14 | 16 | 20;

type ColorSwatchesProps = {
  readonly choices: readonly string[];
  readonly value: string;
  readonly onSelect: (color: string) => void;
  readonly size: ColorSwatchSize;
  readonly ariaLabelPrefix: string;
  readonly className?: string;
};

const sizeClasses: Readonly<Record<ColorSwatchSize, string>> = {
  12: "h-3 w-3",
  14: "h-3.5 w-3.5",
  16: "h-4 w-4",
  20: "h-5 w-5",
};

const selectionRingWidth: Readonly<Record<ColorSwatchSize, string>> = {
  12: "3px",
  14: "3px",
  16: "4px",
  20: "4px",
};

export const ColorSwatches = ({
  choices,
  value,
  onSelect,
  size,
  ariaLabelPrefix,
  className,
}: ColorSwatchesProps) => (
  <>
    {choices.map((choice) => (
      <button
        key={choice}
        type="button"
        onClick={() => onSelect(choice)}
        aria-label={`${ariaLabelPrefix} ${choice}`}
        className={classNames(sizeClasses[size], "rounded-full", className)}
        style={{
          backgroundColor: choice,
          boxShadow:
            choice === value
              ? `0 0 0 2px var(--surface), 0 0 0 ${selectionRingWidth[size]} ${choice}`
              : undefined,
        }}
      />
    ))}
  </>
);
