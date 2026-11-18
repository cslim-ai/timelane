import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedParts, wallToInstant, daySlots, offsetMinutes, nextTransition, addDays, isWorkingTime, formatTime, shortDate } from '../src/time.js';

test('서울과 뉴욕의 같은 순간을 각 현지 날짜로 변환합니다', () => {
  const instant = Date.parse('2026-11-18T01:30:00Z');
  assert.deepEqual(zonedParts(instant, 'Asia/Seoul'), { year: 2026, month: 11, day: 18, hour: 10, minute: 30, second: 0, weekday: 3 });
  assert.equal(zonedParts(instant, 'America/New_York').day, 17);
  assert.equal(zonedParts(instant, 'America/New_York').hour, 20);
});
test('실시간 시계는 초를 표시하고 12시간과 24시간 형식을 따릅니다', () => {
  const instant = Date.parse('2026-11-18T15:02:37Z');
  assert.equal(formatTime(instant, 'Asia/Seoul', '24', 'ko-KR', true), '00:02:37');
  assert.equal(formatTime(instant, 'Asia/Seoul', '12', 'en-US', true), '12:02:37 AM');
  assert.equal(formatTime(instant, 'Asia/Seoul', '12', 'ko-KR', true), '오전 12:02:37');
  assert.equal(formatTime(instant, 'Asia/Seoul'), '00:02');
});
test('현지 날짜가 언어에 맞게 표시되고 기준 시각은 유지됩니다', () => {
  const instant = Date.parse('2026-11-18T15:02:37Z');
  assert.equal(shortDate(instant, 'Asia/Seoul', 'en-US'), 'Thu, 11/19');
  assert.equal(shortDate(instant, 'Asia/Seoul', 'ko-KR'), '11. 19. (목)');
});
test('30분과 45분 시차를 보존합니다', () => {
  const t = Date.parse('2026-01-01T00:00Z');
  assert.equal(offsetMinutes(t, 'Asia/Kolkata'), 330);
  assert.equal(offsetMinutes(t, 'Asia/Kathmandu'), 345);
  assert.equal(offsetMinutes(t, 'Pacific/Chatham'), 825);
});
test('DST 시작·종료일에 실제 23·25개 시간 칸을 만듭니다', () => {
  const spring = daySlots('2026-03-08', 'America/New_York');
  const fall = daySlots('2026-11-01', 'America/New_York');
  assert.equal(spring.length, 23);
  assert.equal(fall.length, 25);
  assert.equal(spring.some(s => zonedParts(s.start, 'America/New_York').hour === 2), false);
  assert.equal(fall.filter(s => zonedParts(s.start, 'America/New_York').hour === 1).length, 2);
});
test('존재하지 않는 현지 시각을 거부하고 중복 시각을 명시적으로 선택합니다', () => {
  assert.throws(() => wallToInstant('2026-03-08', '02:30', 'America/New_York'), /존재하지/);
  assert.equal(wallToInstant('2026-11-01', '01:30', 'America/New_York'), Date.parse('2026-11-01T05:30Z'));
  assert.equal(wallToInstant('2026-11-01', '01:30', 'America/New_York', 'later'), Date.parse('2026-11-01T06:30Z'));
});
test('날짜와 시간대의 잘못된 입력을 거부합니다', () => {
  assert.throws(() => wallToInstant('2026-02-30', '12:00', 'UTC'));
  assert.throws(() => wallToInstant('2026-01-01', '24:30', 'UTC'));
  assert.throws(() => daySlots('2026-01-01', '../invalid'));
});
test('날짜 이동이 월말과 윤년을 통과합니다', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('다가오는 DST 전환 시각과 전후 오프셋을 반환합니다', () => {
  const change = nextTransition(Date.parse('2026-03-05T00:00Z'), 'America/New_York');
  assert.equal(change.at, Date.parse('2026-03-08T07:00Z'));
  assert.equal(change.before, -300);
  assert.equal(change.after, -240);
  assert.equal(nextTransition(Date.parse('2026-03-05T00:00Z'), 'Asia/Seoul'), null);
});
test('표시 범위 마지막 날과 다음 날짜를 통째로 건너뛴 날을 계산합니다', () => {
  assert.equal(daySlots('2100-12-31', 'UTC').at(-1).end, Date.parse('2101-01-01T00:00Z'));
  const samoa = daySlots('2011-12-29', 'Pacific/Apia');
  assert.equal(samoa.length, 24);
  assert.equal(samoa.at(-1).end, Date.parse('2011-12-30T10:00Z'));
  assert.throws(() => daySlots('2011-12-30', 'Pacific/Apia'), /건너뛴/);
});
test('야간 업무시간은 근무를 시작한 요일에 귀속합니다', () => {
  const row = { zone: 'Asia/Seoul', workStart: 1320, workEnd: 360, weekend: [0, 6] };
  assert.equal(isWorkingTime(Date.parse('2026-11-20T17:00Z'), row), true); // 토요일 02시, 금요일 근무
  assert.equal(isWorkingTime(Date.parse('2026-11-22T17:00Z'), row), false); // 월요일 02시, 일요일 휴무
});
