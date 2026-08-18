type ClassValue = string | false | null | undefined;

export const classNames = (...values: readonly ClassValue[]): string =>
  values.filter((value): value is string => Boolean(value)).join(" ");
