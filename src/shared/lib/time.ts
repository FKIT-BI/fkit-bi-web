import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.locale('ru');

export { dayjs };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

let appTz = 'Europe/Moscow';
export const setAppTimezone = (tz: string) => {
  appTz = tz;
};
export const getAppTimezone = () => appTz;

export const inTz = (ms: number, tz = appTz) => dayjs(ms).tz(tz);

export const formatDateTime = (ms: number, tz = appTz) => inTz(ms, tz).format('DD.MM.YYYY HH:mm');
export const formatDateTimeSec = (ms: number, tz = appTz) => inTz(ms, tz).format('DD.MM.YYYY HH:mm:ss');
export const formatDate = (ms: number, tz = appTz) => inTz(ms, tz).format('DD.MM.YYYY');
export const formatTime = (ms: number, tz = appTz) => inTz(ms, tz).format('HH:mm');

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const totalMin = Math.round(sec / 60);
  if (sec > 0 && totalMin === 0) return '< 1 мин';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export const formatHours = (sec: number | null | undefined, digits = 1) =>
  sec == null ? '—' : `${(sec / 3600).toLocaleString('ru-RU', { maximumFractionDigits: digits })} ч`;

export const formatPercent = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;

const offsetCache = new Map<string, number>();
function offsetMinutes(ms: number, tz: string): number {
  const key = `${tz}:${Math.floor(ms / HOUR)}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    off = dayjs(ms).tz(tz).utcOffset();
    offsetCache.set(key, off);
  }
  return off;
}

/** ISO-8601 with the zone offset; milliseconds are kept when present so exact backend boundaries survive a round trip. */
export function toIso(ms: number, tz = appTz): string {
  const off = offsetMinutes(ms, tz);
  const local = new Date(ms + off * MINUTE).toISOString().slice(0, ms % 1000 === 0 ? 19 : 23);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${local}${sign}${hh}:${mm}`;
}

export const localDate = (ms: number, tz = appTz) => inTz(ms, tz).format('YYYY-MM-DD');

export const dayStartMs = (date: string, tz = appTz) => dayjs.tz(date, 'YYYY-MM-DD', tz).valueOf();

export function atLocal(date: string, hhmm: string, tz = appTz, addDays = 0): number {
  return dayjs.tz(`${date} ${hhmm}`, 'YYYY-MM-DD HH:mm', tz).add(addDays, 'day').valueOf();
}

export const addDaysToDate = (date: string, n: number) =>
  dayjs(date, 'YYYY-MM-DD').add(n, 'day').format('YYYY-MM-DD');

export const parseLocal = (value: string, tz = appTz) => dayjs.tz(value, 'YYYY-MM-DD HH:mm:ss', tz).valueOf();
export const toLocalString = (ms: number, tz = appTz) => inTz(ms, tz).format('YYYY-MM-DD HH:mm:ss');
