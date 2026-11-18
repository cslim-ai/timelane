const formatters = new Map();
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return formatters.get(zone);
}

export function isTimeZone(zone) {
  if (typeof zone !== 'string' || zone.length > 100) return false;
  try { formatter(zone); return true; } catch { return false; }
}

export function zonedParts(instant, zone) {
  const values = Object.fromEntries(formatter(zone).formatToParts(new Date(instant))
    .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  values.weekday = new Date(Date.UTC(values.year, values.month - 1, values.day)).getUTCDay();
  return values;
}

export function dateString(instant, zone) {
  const p = zonedParts(instant, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
export function pad(value) { return String(value).padStart(2, '0'); }
function offsetMilliseconds(instant, zone) {
  const p = zonedParts(instant, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}
export function offsetMinutes(instant, zone) {
  return Math.round(offsetMilliseconds(instant, zone) / MINUTE);
}
export function parseDate(date, boundary = false) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < (boundary ? 1899 : 1900) || year > (boundary ? 2101 : 2100) || check.toISOString().slice(0, 10) !== date) throw new Error('1900~2100년의 올바른 날짜를 선택해 주세요.');
  return { year, month, day };
}
export function addDays(date, count) {
  const p = parseDate(date);
  const result = new Date(Date.UTC(p.year, p.month - 1, p.day + count)).toISOString().slice(0, 10);
  parseDate(result);
  return result;
}

// 가능한 UTC 오프셋을 수집한 뒤 현지 시각으로 역검증합니다.
// DST 간격은 거부하며 중복 시각은 earlier/later로 구분합니다.
export function wallToInstant(date, time, zone, disambiguation = 'earlier') {
  const p = parseDate(date, true);
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('시각은 HH:MM 형식이어야 합니다.');
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('올바른 시각을 입력해 주세요.');
  const wall = Date.UTC(p.year, p.month - 1, p.day, hour, minute);
  const offsets = new Set();
  for (let h = -36; h <= 36; h += 6) offsets.add(offsetMilliseconds(wall + h * HOUR, zone));
  const candidates = [...offsets].map(offset => wall - offset).filter(instant => {
    const z = zonedParts(instant, zone);
    return z.year === p.year && z.month === p.month && z.day === p.day && z.hour === hour && z.minute === minute && z.second === 0;
  }).sort((a, b) => a - b);
  if (!candidates.length) throw new Error('이 현지 시각은 서머타임 또는 시간대 변경으로 존재하지 않습니다. 다른 시각을 선택해 주세요.');
  return disambiguation === 'later' ? candidates.at(-1) : candidates[0];
}

export function startOfDay(date, zone) {
  for (let minute = 0; minute < 24 * 60; minute += 15) {
    try { return wallToInstant(date, `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, zone); }
    catch (error) { if (!error.message.includes('존재하지')) throw error; }
  }
  throw new Error('시간대 변경으로 이 지역에서 건너뛴 날짜입니다. 다른 날짜를 선택해 주세요.');
}
export function daySlots(date, zone) {
  parseDate(date);
  const start = startOfDay(date, zone);
  // 다음 날짜가 통째로 생략되거나 지원 범위 끝을 넘더라도 실제 하루의 끝을 찾습니다.
  let low = start, high = start + HOUR;
  while (dateString(high, zone) === date && high - start <= 48 * HOUR) { low = high; high += HOUR; }
  if (high - start > 49 * HOUR) throw new Error('이 날짜의 시간대 경계를 계산할 수 없습니다.');
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2000) * 1000;
    if (dateString(middle, zone) === date) low = middle; else high = middle;
  }
  const end = high;
  const slots = [];
  for (let instant = start; instant < end; instant += HOUR) slots.push({ start: instant, end: Math.min(instant + HOUR, end) });
  return slots;
}

export function nextTransition(instant, zone, days = 7) {
  const before = offsetMinutes(instant, zone);
  let previous = Math.floor(instant / MINUTE) * MINUTE;
  const limit = instant + days * 24 * HOUR;
  for (let cursor = previous + 6 * HOUR; cursor <= limit + 6 * HOUR; cursor += 6 * HOUR) {
    const next = Math.min(cursor, limit);
    if (offsetMinutes(next, zone) !== before) {
      let low = previous, high = next;
      while (high - low > MINUTE) {
        const mid = Math.floor((low + high) / (2 * MINUTE)) * MINUTE;
        if (offsetMinutes(mid, zone) === before) low = mid; else high = mid;
      }
      return { at: high, before, after: offsetMinutes(high, zone) };
    }
    previous = next;
    if (next === limit) break;
  }
  return null;
}

export function utcOffset(instant, zone) {
  const offset = offsetMinutes(instant, zone);
  return `UTC${offset >= 0 ? '+' : '−'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
export function zoneAbbreviation(instant, zone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(instant).find(p => p.type === 'timeZoneName').value;
}
export function formatTime(instant, zone, format = '24', locale = 'en-US', showSeconds = false) {
  return new Intl.DateTimeFormat(format === '24' ? 'en-GB' : locale, {
    timeZone: zone, hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined,
    hourCycle: format === '24' ? 'h23' : format === '12' ? 'h12' : undefined,
  }).format(instant);
}
export function shortDate(instant, zone, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, month: 'numeric', day: 'numeric', weekday: 'short' }).format(instant);
}
export function isWorkingTime(instant, location) {
  const p = zonedParts(instant, location.zone);
  const minute = p.hour * 60 + p.minute;
  const overnight = location.workStart > location.workEnd;
  const workday = overnight && minute < location.workEnd ? (p.weekday + 6) % 7 : p.weekday;
  if (location.weekend.includes(workday)) return false;
  return location.workStart < location.workEnd
    ? minute >= location.workStart && minute < location.workEnd
    : minute >= location.workStart || minute < location.workEnd;
}
