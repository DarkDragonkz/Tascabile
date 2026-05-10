export function parseDateOrUndefined(value: string): Date | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed;
}

export function toUnixTimestampSeconds(date: Date | undefined): number | undefined {
  if (!date) return undefined;
  return Math.floor(date.getTime() / 1000);
}
