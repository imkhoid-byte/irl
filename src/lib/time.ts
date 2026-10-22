// A single clock for the whole server so tests (and demo tooling) can control "now".
let override: Date | null = null;

export function now(): Date {
  return override ? new Date(override) : new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export function setNowForTests(date: Date | null) {
  override = date;
}

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

export function addHours(date: Date | string, hours: number): Date {
  return new Date(new Date(date).getTime() + hours * HOUR);
}

export function addMinutes(date: Date | string, minutes: number): Date {
  return new Date(new Date(date).getTime() + minutes * MINUTE);
}

export function minDate(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

// All demo inventory is in New York. Display times in the venue's timezone, not the viewer's.
export const CITY_TZ = "America/New_York";

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: CITY_TZ }).format(new Date(iso));
}

export function formatShortDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: CITY_TZ }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CITY_TZ }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDay(iso)} · ${formatTime(iso)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${minutes} minutes`;
}

export function formatRelative(iso: string, from: Date = now()): string {
  const diff = new Date(iso).getTime() - from.getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [24 * HOUR, "day"],
    [HOUR, "hour"],
    [MINUTE, "minute"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      const s = `${n} ${label}${n === 1 ? "" : "s"}`;
      return diff >= 0 ? `in ${s}` : `${s} ago`;
    }
  }
  return diff >= 0 ? "in a moment" : "just now";
}

/** Day of week (0=Sun) and minutes since midnight for an instant, in the city timezone. */
export function cityParts(iso: string): { dow: number; minutes: number; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CITY_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    dow: dows.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Convert a wall-clock time in the city timezone to a UTC instant. */
export function cityTimeToUtc(ymd: string, hhmm: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  // Start from the naive UTC guess and correct by the zone offset at that instant (twice, for DST edges).
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = cityParts(new Date(guess).toISOString());
    const [py, pm, pd] = p.ymd.split("-").map(Number);
    const asIfUtc = Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60);
    guess += Date.UTC(y, mo - 1, d, h, mi) - asIfUtc;
  }
  return new Date(guess);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
