import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityReport, findCommonSlot } from '../src/planner.js';

const seoul = { name: '서울', zone: 'Asia/Seoul', workStart: 540, workEnd: 1080, weekend: [0, 6] };
const tokyo = { ...seoul, name: '도쿄', zone: 'Asia/Tokyo' };
test('공통 업무시간의 첫 한 시간을 절대시각으로 찾습니다', () => {
  assert.deepEqual(findCommonSlot('2026-11-18', [seoul, tokyo]), { start: Date.parse('2026-11-18T00:00Z'), end: Date.parse('2026-11-18T01:00Z') });
  assert.equal(findCommonSlot('2026-11-22', [seoul, tokyo]), null);
});
test('일정의 시작만 업무시간인 경우 업무시간으로 판정하지 않습니다', () => {
  const selection = { start: Date.parse('2026-11-18T08:30Z'), end: Date.parse('2026-11-18T09:30Z') };
  const report = availabilityReport(selection, [seoul], []);
  assert.equal(report.locations[0].working, false);
});
test('겹치는 캘린더 일정만 바쁜 일정으로 반환합니다', () => {
  const selection = { start: Date.parse('2026-11-18T01:00Z'), end: Date.parse('2026-11-18T02:00Z') };
  const report = availabilityReport(selection, [seoul], [{ ...selection, title: '바쁜 시간' }, { start: selection.end, end: selection.end + 1000 }]);
  assert.equal(report.busy.length, 1);
  assert.equal(report.locations[0].working, true);
});
test('길이가 없는 순간 일정은 바쁜 시간으로 차단하지 않습니다', () => {
  const selection = { start: Date.parse('2026-11-18T01:00Z'), end: Date.parse('2026-11-18T02:00Z') };
  assert.equal(availabilityReport(selection, [seoul], [{ start: selection.start + 1000, end: selection.start + 1000 }]).busy.length, 0);
});
