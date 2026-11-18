import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK_STORAGE_KEY, LEGACY_STORAGE_KEY, createClockState, validateClockState, loadClockState, saveClockState, reorderCities, clockWindow } from '../src/clock-state.js';

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('기본 화면은 서울을 첫 번째 도시에 고정합니다', () => {
  const state = createClockState(Date.parse('2026-11-17T16:00Z'));
  assert.equal(state.locations[0], 'seoul');
  assert.equal(state.date, '2026-11-18');
  assert.equal(state.version, 2);
});
test('서울 누락·이동·중복·알 수 없는 도시는 저장할 수 없습니다', () => {
  for (const locations of [['london'], ['london', 'seoul'], ['seoul', 'seoul'], ['seoul', 'invalid']]) {
    assert.throws(() => validateClockState({ ...createClockState(), locations }));
  }
  assert.throws(() => validateClockState({ ...createClockState(), date: '2026-02-30' }));
});
test('도시를 맨 위로 끌어도 서울 아래에 배치하고 서울 이동은 무시합니다', () => {
  assert.deepEqual(reorderCities(['seoul', 'london', 'new-york'], 'new-york', 0), ['seoul', 'new-york', 'london']);
  assert.deepEqual(reorderCities(['seoul', 'london', 'new-york'], 'seoul', 2), ['seoul', 'london', 'new-york']);
  assert.deepEqual(reorderCities(['seoul', 'london', 'new-york'], 'london', 99), ['seoul', 'new-york', 'london']);
});
test('과거 활성 그룹의 도시를 서울부터 읽고 기존 그룹·일정 데이터는 보존합니다', () => {
  const legacy = JSON.stringify({ version: 1, activeGroupId: 'second', format: '12', title: '기존 일정', groups: [
    { id: 'first', locations: [{ id: 'paris' }] },
    { id: 'second', locations: [{ id: 'london' }, { id: 'new-york' }] },
  ] });
  const storage = memoryStorage([[LEGACY_STORAGE_KEY, legacy]]);
  const state = loadClockState(storage, Date.parse('2026-11-18T01:00Z'));
  assert.deepEqual(state.locations, ['seoul', 'london', 'new-york']);
  assert.equal(state.format, '12');
  saveClockState(storage, state);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), legacy);
  assert.equal(JSON.parse(storage.getItem(CLOCK_STORAGE_KEY)).version, 2);
});
test('새 도시 목록을 재방문할 때 복원하고 날짜는 서울의 오늘로 표시합니다', () => {
  const storage = memoryStorage();
  saveClockState(storage, { ...createClockState(), locations: ['seoul', 'tokyo'], date: '2026-01-01' });
  const state = loadClockState(storage, Date.parse('2026-11-17T16:00Z'));
  assert.deepEqual(state.locations, ['seoul', 'tokyo']);
  assert.equal(state.date, '2026-11-18');
});
test('손상된 신규 설정을 조용히 덮어쓰지 않습니다', () => {
  const storage = memoryStorage([[CLOCK_STORAGE_KEY, '{broken']]);
  assert.throws(() => loadClockState(storage));
  assert.equal(storage.getItem(CLOCK_STORAGE_KEY), '{broken');
});
test('서울 자정 직후에도 현재 시간 칸을 중심으로 앞뒤 날짜를 함께 표시합니다', () => {
  const window = clockWindow(Date.parse('2026-11-18T15:27:37Z'), 5);
  assert.equal(window.date, '2026-11-19');
  assert.equal(window.center.start, Date.parse('2026-11-18T15:00Z'));
  assert.deepEqual(window.slots.map(slot => new Date(slot.start).toISOString().slice(11, 16)), ['13:00', '14:00', '15:00', '16:00', '17:00']);
});
test('이전·이후 시간 이동은 서울 자정을 넘고 연속해서 되돌아올 수 있습니다', () => {
  const origin = Date.parse('2026-11-18T14:59:59Z');
  const initial = clockWindow(origin, 25);
  const next = clockWindow(origin, 25, 1);
  assert.equal(initial.center.start, Date.parse('2026-11-18T14:00Z'));
  assert.equal(initial.slots[12].start, initial.center.start);
  assert.equal(next.date, '2026-11-19');
  assert.equal(clockWindow(next.center.start, 25, -1).center.start, initial.center.start);
});
test('지원 기간의 첫 시간과 마지막 시간 바깥쪽을 비워 현재 칸의 위치를 유지합니다', () => {
  const earliest = clockWindow(Date.parse('1899-12-31T15:32:08Z'), 5);
  const last = clockWindow(Date.parse('2100-12-31T14:59Z'), 5);
  assert.equal(earliest.date, '1900-01-01');
  assert.equal(earliest.center.start, Date.parse('1899-12-31T15:32:08Z'));
  assert.equal(earliest.emptyBefore, 2);
  assert.equal(last.emptyAfter, 2);
  assert.equal(last.slots.length + last.emptyAfter, 5);
});
test('한 번에 여러 칸을 끌어도 날짜를 넘어 가운데 칸을 옮깁니다', () => {
  const origin = Date.parse('2026-11-18T14:53Z');
  const later = clockWindow(origin, 5, 27);
  assert.equal(later.date, '2026-11-20');
  assert.equal(later.slots[2].start, Date.parse('2026-11-19T17:00Z'));
  const earlier = clockWindow(later.center.start, 5, -28);
  assert.equal(earlier.slots[2].start, Date.parse('2026-11-18T13:00Z'));
});
test('장거리 이동도 지원 기간의 양 끝에서 멈춥니다', () => {
  const earliest = Date.parse('1899-12-31T15:32:08Z');
  const latest = Date.parse('2100-12-31T14:00Z');
  assert.equal(clockWindow(earliest, 5, -10).center.start, earliest);
  assert.equal(clockWindow(latest, 5, 10).center.start, latest);
});
