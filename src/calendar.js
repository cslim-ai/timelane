import { formatTime, shortDate, wallToInstant, startOfDay, daySlots, MINUTE } from './time.js';

function utcStamp(instant) { return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function escapeIcs(value) { return String(value).replaceAll('\\', '\\\\').replace(/\r?\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\r', ''); }
function unescapeIcs(value) { return value.replace(/\\([nN,;\\])/g, (_, c) => c === 'n' || c === 'N' ? '\n' : c); }
function fold(line) {
  const lines = []; let current = '', length = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (length + size > 75) { lines.push(current); current = ' '; length = 1; }
    current += char; length += size;
  }
  lines.push(current); return lines.join('\r\n');
}
function validEvent(event) {
  if (!event || !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= event.start) throw new Error('일정 시작과 종료 시각을 확인해 주세요.');
}
export function buildIcs(event, uid = globalThis.crypto.randomUUID()) {
  validEvent(event);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TimeLane//Local Time Planner//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${escapeIcs(uid)}@timelane.local`, `DTSTAMP:${utcStamp(Date.now())}`, `DTSTART:${utcStamp(event.start)}`, `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${escapeIcs(event.title || 'TimeLane 일정')}`, `DESCRIPTION:${escapeIcs(event.notes || '')}`, 'END:VEVENT', 'END:VCALENDAR', ''].map(fold).join('\r\n');
}
function parseStamp(property, fallbackZone) {
  const [key, value] = property;
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!match) throw new Error('지원하지 않는 캘린더 날짜 형식입니다.');
  const [, year, month, day, hour = '00', minute = '00', second = '00', z] = match;
  if (Number(second) > 59) throw new Error('초 범위 오류');
  const zoneMatch = /(?:^|;)TZID=(?:"([^"]+)"|([^;:]+))/i.exec(key);
  const zone = z ? 'UTC' : zoneMatch ? zoneMatch[1] || zoneMatch[2] : fallbackZone;
  if (!match[4]) {
    if (zoneMatch) throw new Error('종일 날짜에는 TZID를 사용할 수 없습니다.');
    return startOfDay(`${year}-${month}-${day}`, fallbackZone);
  }
  return wallToInstant(`${year}-${month}-${day}`, `${hour}:${minute}`, zone) + Number(second) * 1000;
}
export function parseIcs(content, fallbackZone = 'UTC') {
  if (typeof content !== 'string' || new TextEncoder().encode(content).length > 2_000_000) throw new Error('캘린더 파일은 2MB 이하여야 합니다.');
  if (!/BEGIN:VCALENDAR/i.test(content) || !/END:VCALENDAR/i.test(content)) throw new Error('올바른 ICS 캘린더 파일을 선택해 주세요.');
  const lines = content.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = []; let skipped = 0, block = null, nestedDepth = 0;
  for (const line of lines) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') { block = []; nestedDepth = 0; continue; }
    if (block && /^BEGIN:/i.test(line)) { nestedDepth++; continue; }
    if (block && nestedDepth > 0) { if (/^END:/i.test(line)) nestedDepth--; continue; }
    if (line.toUpperCase() === 'END:VEVENT' && block) {
      try {
        const find = name => block.find(([key]) => key.split(';')[0].toUpperCase() === name);
        if (find('RRULE') || find('RECURRENCE-ID') || find('RDATE') || find('EXDATE')) throw new Error('반복 일정 미지원');
        if (find('STATUS')?.[1].toUpperCase() === 'CANCELLED' || find('TRANSP')?.[1].toUpperCase() === 'TRANSPARENT') { block = null; continue; }
        const startProperty = find('DTSTART');
        if (!startProperty) throw new Error('시작 시각 누락');
        const start = parseStamp(startProperty, fallbackZone);
        const endProperty = find('DTEND');
        const duration = find('DURATION');
        if (duration && !endProperty) throw new Error('DURATION 일정 미지원');
        const allDay = !startProperty[1].includes('T');
        const end = endProperty ? parseStamp(endProperty, fallbackZone) : allDay
          ? daySlots(`${startProperty[1].slice(0, 4)}-${startProperty[1].slice(4, 6)}-${startProperty[1].slice(6, 8)}`, fallbackZone).at(-1).end : start;
        const event = { start, end, title: unescapeIcs(find('SUMMARY')?.[1] || '일정'), notes: unescapeIcs(find('DESCRIPTION')?.[1] || '') };
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || endProperty && end === start) throw new Error('잘못된 종료 시각입니다.');
        if (events.length >= 5000) throw new Error('최대 일정 수 초과');
        events.push(event);
      } catch { skipped++; }
      block = null; continue;
    }
    if (block) {
      // 콜론은 TZID 따옴표 밖에 있는 첫 번째 구분자여야 합니다.
      let quoted = false, separator = -1;
      for (let i = 0; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; if (line[i] === ':' && !quoted) { separator = i; break; } }
      if (separator >= 0) block.push([line.slice(0, separator), line.slice(separator + 1)]);
    }
  }
  if (block) skipped++;
  return { events, skipped };
}
export function calendarLinks(event) {
  validEvent(event);
  const google = new URL('https://calendar.google.com/calendar/render');
  google.search = new URLSearchParams({ action: 'TEMPLATE', text: event.title || 'TimeLane 일정', dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`, details: event.notes || '' });
  const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  outlook.search = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: event.title || 'TimeLane 일정', startdt: new Date(event.start).toISOString(), enddt: new Date(event.end).toISOString(), body: event.notes || '' });
  return { google: google.href, outlook: outlook.href };
}
export function scheduleText(event, locations, format = '24') {
  validEvent(event);
  return [event.title || 'TimeLane 일정', '', ...locations.map(location => `${location.name}: ${shortDate(event.start, location.zone)} ${formatTime(event.start, location.zone, format, location.locale)} → ${shortDate(event.end, location.zone)} ${formatTime(event.end, location.zone, format, location.locale)} (${location.zone})`), '', `소요 시간: ${(event.end - event.start) / MINUTE}분`, event.notes || ''].filter((line, index, list) => line || list[index - 1] !== '').join('\n');
}
