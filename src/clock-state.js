import { addDays, dateString, daySlots, parseDate } from './time.js';
import { getLocation } from './locations.js';

export const SEOUL_ZONE = 'Asia/Seoul';
export const CLOCK_STORAGE_KEY = 'timelane.clock.v2';
export const LEGACY_STORAGE_KEY = 'timelane.v1';
export const MAX_CITIES = 20;
export const MIN_CLOCK_DATE = '1900-01-01';
export const MAX_CLOCK_DATE = '2100-12-31';

export function createClockState(now = Date.now()) {
  return { version: 2, locations: ['seoul', 'london', 'new-york', 'san-francisco'], date: dateString(now, SEOUL_ZONE), format: '24' };
}
export function validateClockState(input) {
  if (!input || input.version !== 2 || !Array.isArray(input.locations) || input.locations.length < 1 || input.locations.length > MAX_CITIES) throw new Error('도시 목록을 읽을 수 없습니다.');
  if (input.locations[0] !== 'seoul' || new Set(input.locations).size !== input.locations.length || input.locations.some(id => !getLocation(id))) throw new Error('서울이 첫 번째에 있어야 하며 올바른 도시를 중복 없이 선택해야 합니다.');
  if (!['12', '24'].includes(input.format)) throw new Error('12시간 또는 24시간 형식을 선택해 주세요.');
  parseDate(input.date);
  return { version: 2, locations: [...input.locations], date: input.date, format: input.format };
}
export function loadClockState(storage, now = Date.now()) {
  const raw = storage.getItem(CLOCK_STORAGE_KEY);
  const today = dateString(now, SEOUL_ZONE);
  if (raw) {
    if (raw.length > 120_000) throw new Error('도시 목록이 너무 큽니다.');
    return { ...validateClockState(JSON.parse(raw)), date: today };
  }
  const state = createClockState(now);
  const oldRaw = storage.getItem(LEGACY_STORAGE_KEY);
  if (!oldRaw) return state;
  if (oldRaw.length > 120_000) throw new Error('이전 설정이 너무 큽니다.');
  const legacy = JSON.parse(oldRaw);
  if (legacy?.version !== 1 || !Array.isArray(legacy.groups)) throw new Error('이전 도시 목록을 읽을 수 없습니다.');
  const active = legacy.groups.find(group => group?.id === legacy.activeGroupId) || legacy.groups[0];
  if (!Array.isArray(active?.locations)) throw new Error('이전 도시 목록이 올바르지 않습니다.');
  state.locations = [...new Set(['seoul', ...active.locations.map(row => row?.id).filter(id => getLocation(id))])].slice(0, MAX_CITIES);
  state.format = legacy.format === '12' ? '12' : '24';
  return validateClockState(state);
}
export function saveClockState(storage, state) {
  storage.setItem(CLOCK_STORAGE_KEY, JSON.stringify(validateClockState(state)));
}
export function reorderCities(ids, id, targetIndex) {
  const result = [...ids];
  if (id === 'seoul') return result;
  const current = result.indexOf(id);
  if (current < 1 || !Number.isInteger(targetIndex)) throw new Error('이동할 도시를 찾을 수 없습니다.');
  result.splice(current, 1);
  result.splice(Math.max(1, Math.min(targetIndex, result.length)), 0, id);
  return result;
}
export function clockWindow(instant, count, shift = 0) {
  let date = dateString(instant, SEOUL_ZONE);
  let today = daySlots(date, SEOUL_ZONE);
  let index = today.findIndex(slot => instant >= slot.start && instant < slot.end) + shift;

  while (index < 0 && date > MIN_CLOCK_DATE) {
    date = addDays(date, -1);
    today = daySlots(date, SEOUL_ZONE);
    index += today.length;
  }
  while (index >= today.length && date < MAX_CLOCK_DATE) {
    index -= today.length;
    date = addDays(date, 1);
    today = daySlots(date, SEOUL_ZONE);
  }
  index = Math.max(0, Math.min(index, today.length - 1));

  const past = date > MIN_CLOCK_DATE ? daySlots(addDays(date, -1), SEOUL_ZONE) : [];
  const future = date < MAX_CLOCK_DATE ? daySlots(addDays(date, 1), SEOUL_ZONE) : [];
  const all = [...past, ...today, ...future];
  const centerIndex = past.length + index;
  const start = centerIndex - Math.floor(count / 2);
  const end = start + count;

  return {
    date,
    slots: all.slice(Math.max(0, start), end),
    emptyBefore: Math.max(0, -start),
    emptyAfter: Math.max(0, end - all.length),
    center: all[centerIndex],
  };
}
