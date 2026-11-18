import { dateString, parseDate, daySlots, HOUR, MINUTE } from './time.js';
import { getLocation } from './locations.js';

export const STORAGE_KEY = 'timelane.v1';
export const LIMITS = { groups: 8, locations: 20, file: 2_000_000, state: 120_000 };
export function makeRow(id) {
  return { id, label: '', workStart: 9 * 60, workEnd: 18 * 60, weekend: ['riyadh', 'doha', 'jerusalem'].includes(id) ? [5, 6] : [0, 6] };
}
export function createState(now = Date.now()) {
  return {
    version: 1, groups: [{ id: 'default', name: '나의 시간대', locations: ['seoul', 'london', 'new-york', 'san-francisco'].map(makeRow) }],
    activeGroupId: 'default', date: dateString(now, 'Asia/Seoul'), selection: null,
    format: '24', showZones: true, markWeekends: true, title: '', notes: '',
  };
}
function requireValue(condition, message = '저장 데이터의 형식이 올바르지 않습니다.') { if (!condition) throw new Error(message); }
function text(value, max) { requireValue(typeof value === 'string' && value.length <= max); return value; }
export function validateState(input) {
  requireValue(input && typeof input === 'object' && input.version === 1, '지원하지 않는 설정 파일입니다. TimeLane 버전 1 백업을 선택해 주세요.');
  requireValue(Array.isArray(input.groups) && input.groups.length >= 1 && input.groups.length <= LIMITS.groups);
  const groupIds = new Set();
  const groups = input.groups.map(group => {
    requireValue(group && /^[a-zA-Z0-9_-]{1,64}$/.test(group.id) && !groupIds.has(group.id));
    groupIds.add(group.id);
    requireValue(Array.isArray(group.locations) && group.locations.length >= 1 && group.locations.length <= LIMITS.locations);
    const ids = new Set();
    return { id: group.id, name: text(group.name, 32), locations: group.locations.map(row => {
      requireValue(row && getLocation(row.id) && !ids.has(row.id), '알 수 없거나 중복된 도시가 있습니다.'); ids.add(row.id);
      requireValue(Number.isInteger(row.workStart) && row.workStart >= 0 && row.workStart < 1440);
      requireValue(Number.isInteger(row.workEnd) && row.workEnd >= 0 && row.workEnd <= 1440 && row.workEnd !== row.workStart);
      requireValue(Array.isArray(row.weekend) && row.weekend.length <= 7 && new Set(row.weekend).size === row.weekend.length && row.weekend.every(d => Number.isInteger(d) && d >= 0 && d <= 6));
      return { id: row.id, label: text(row.label, 60), workStart: row.workStart, workEnd: row.workEnd, weekend: [...row.weekend] };
    }) };
  });
  requireValue(groupIds.has(input.activeGroupId));
  parseDate(input.date);
  daySlots(input.date, getLocation(groups.find(g => g.id === input.activeGroupId).locations[0].id).zone);
  requireValue(['12', '24', 'mx'].includes(input.format));
  requireValue(typeof input.showZones === 'boolean' && typeof input.markWeekends === 'boolean');
  let selection = null;
  if (input.selection !== null) {
    const { start, end } = input.selection || {};
    requireValue(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end - start >= 5 * MINUTE && end - start <= 48 * HOUR);
    requireValue(start >= Date.UTC(1899, 11, 29) && end <= Date.UTC(2101, 0, 3));
    selection = { start, end };
  }
  return { version: 1, groups, activeGroupId: input.activeGroupId, date: input.date, selection, format: input.format, showZones: input.showZones, markWeekends: input.markWeekends, title: text(input.title, 120), notes: text(input.notes, 2000) };
}
export function encodeShare(state) {
  const clean = validateState(state);
  clean.groups = clean.groups.filter(group => group.id === clean.activeGroupId);
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function decodeShare(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 64_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('공유 링크가 올바르지 않거나 너무 큽니다.');
  try {
    const raw = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    return validateState(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0)))));
  } catch { throw new Error('공유 링크를 읽을 수 없습니다. 링크 전체를 복사했는지 확인해 주세요.'); }
}
export function persistState(storage, state, shared = false) {
  if (shared) return false;
  storage.setItem(STORAGE_KEY, JSON.stringify(validateState(state)));
  return true;
}
export function createShareUrl(pageHref, state) {
  const url = new URL(pageHref);
  url.hash = `view=${encodeShare(state)}`;
  return url.href;
}
export function createSettingsBackup(state, readStored) {
  let content;
  try { content = readStored(); }
  catch { return { content: JSON.stringify(validateState(state), null, 2), storageAvailable: false }; }
  return { content: content || JSON.stringify(validateState(state), null, 2), storageAvailable: true };
}
