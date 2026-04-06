import type { IPOStatus } from "./types";

const CHINA_TIMEZONE = "Asia/Shanghai";

interface ParsedDateParts {
  year?: number;
  month: number;
  day: number;
}

function formatDateParts(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
}

function parseDateParts(input: string | null | undefined): ParsedDateParts | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const text = input.trim();
  if (!text) {
    return null;
  }

  const fullMatch = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (fullMatch) {
    return {
      year: Number(fullMatch[1]),
      month: Number(fullMatch[2]),
      day: Number(fullMatch[3])
    };
  }

  const monthDayMatch = text.match(/(\d{1,2})[-/](\d{1,2})/);
  if (!monthDayMatch) {
    return null;
  }

  return {
    month: Number(monthDayMatch[1]),
    day: Number(monthDayMatch[2])
  };
}

function isValidDateParts(parts: ParsedDateParts): boolean {
  if (!parts.month || !parts.day) {
    return false;
  }

  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return false;
  }

  const year = parts.year ?? 2000;
  const candidate = new Date(Date.UTC(year, parts.month - 1, parts.day));
  return !Number.isNaN(candidate.getTime()) &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() + 1 === parts.month &&
    candidate.getUTCDate() === parts.day;
}

function formatISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function currentChinaYear(today = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CHINA_TIMEZONE,
      year: "numeric"
    }).format(today)
  );
}

export function nowInChinaISOString(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: CHINA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(" ", "T");
}

export function currentChinaDate(date = new Date()): string {
  return formatDateParts(date);
}

export function inferRecordYearContext(subStartInput: string | null | undefined, today = new Date()): number | null {
  const parsed = parseDateParts(subStartInput);
  if (!parsed || !isValidDateParts(parsed)) {
    return null;
  }

  if (parsed.year) {
    return parsed.year;
  }

  const todayString = currentChinaDate(today);
  const candidate = formatISO(currentChinaYear(today), parsed.month, parsed.day);
  return candidate > todayString ? currentChinaYear(today) - 1 : currentChinaYear(today);
}

export function normalizeChinaDate(
  input: string | null | undefined,
  today = new Date(),
  yearContext?: number | null
): string | null {
  const parsed = parseDateParts(input);
  if (!parsed || !isValidDateParts(parsed)) {
    return null;
  }

  const year = parsed.year ?? yearContext ?? currentChinaYear(today);
  return formatISO(year, parsed.month, parsed.day);
}

export function shiftISODateYear(value: string | null | undefined, delta: number): string | null {
  if (!value) {
    return null;
  }

  const parsed = parseDateParts(value);
  if (!parsed || !parsed.year || !isValidDateParts(parsed)) {
    return value ?? null;
  }

  return formatISO(parsed.year + delta, parsed.month, parsed.day);
}

export function inferIPOStatus(record: {
  subStart: string | null;
  listDate: string | null;
}, today = currentChinaDate()): IPOStatus {
  if (record.listDate && today >= record.listDate) {
    return "listed";
  }

  if (record.subStart && today >= record.subStart) {
    return "open";
  }

  return "upcoming";
}
