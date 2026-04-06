function isMemberLocked(text: string): boolean {
  return text.includes("会员") || text.includes("setting/member");
}

export function cleanRequiredText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  if (!text || text === "None") {
    return "";
  }

  return text;
}

export function cleanOptionalText(value: unknown): string | null {
  const text = cleanRequiredText(value);
  if (!text || isMemberLocked(text)) {
    return null;
  }
  return text;
}

export function joinOptionalText(...values: Array<unknown>): string | null {
  const joined = values
    .map((value) => cleanOptionalText(value))
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  return joined || null;
}
