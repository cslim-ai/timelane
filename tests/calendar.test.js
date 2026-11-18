import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, parseIcs, calendarLinks, scheduleText } from '../src/calendar.js';

const event = { title: '서울, 뉴욕; 회의\n두 번째 줄', notes: '메모\\테스트', start: Date.parse('2026-11-18T01:00Z'), end: Date.parse('2026-11-18T02:00Z') };
test('ICS를 UTC 시각과 안전한 이스케이프로 내보내고 다시 읽습니다', () => {
  const ics = buildIcs(event, '고정-테스트');
  assert.ok(ics.includes('DTSTART:20261118T010000Z\r\n'));
  assert.ok(ics.includes('SUMMARY:서울\\, 뉴욕\\; 회의\\n두 번째 줄'));
  const parsed = parseIcs(ics, 'Asia/Seoul');
  assert.equal(parsed.events[0].start, event.start);
  assert.equal(parsed.events[0].title, event.title);
  assert.equal(parsed.events[0].end, event.end);
});
test('TZID 시각과 종일 일정의 끝을 해석합니다', () => {
  const parsed = parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Asia/Seoul:20261118T100000\r\nDTEND;TZID=Asia/Seoul:20261118T110000\r\nSUMMARY:회의\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261119\r\nDTEND;VALUE=DATE:20261120\r\nSUMMARY:휴일\r\nEND:VEVENT\r\nEND:VCALENDAR', 'Asia/Seoul');
  assert.equal(parsed.events[0].start, event.start);
  assert.equal(parsed.events[1].end - parsed.events[1].start, 86_400_000);
});
test('반복 규칙과 해석할 수 없는 일정은 건너뛰고 결과를 알립니다', () => {
  const parsed = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261118T010000Z\nRRULE:FREQ=DAILY\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;TZID=Unknown/Zone:20261118T100000\nEND:VEVENT\nEND:VCALENDAR', 'UTC');
  assert.equal(parsed.events.length, 0);
  assert.equal(parsed.skipped, 2);
  assert.throws(() => parseIcs('<html>잘못된 파일</html>', 'UTC'));
  assert.throws(() => parseIcs('x'.repeat(2_100_000), 'UTC'));
});
test('줄 접기는 한국어 UTF-8 기준 75옥텟을 지킵니다', () => {
  const ics = buildIcs({ ...event, title: '한글'.repeat(100) });
  assert.ok(ics.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75));
  assert.equal(parseIcs(ics, 'UTC').events[0].title, '한글'.repeat(100));
});
test('캘린더 링크와 일정 복사 내용은 같은 절대 시각을 가리킵니다', () => {
  const links = calendarLinks(event);
  assert.equal(new URL(links.google).searchParams.get('dates'), '20261118T010000Z/20261118T020000Z');
  assert.equal(new URL(links.outlook).searchParams.get('startdt'), '2026-11-18T01:00:00.000Z');
  const text = scheduleText(event, [{ name: '서울', zone: 'Asia/Seoul' }, { name: '뉴욕', zone: 'America/New_York' }], '24');
  assert.match(text, /서울.*10:00.*11:00/);
  assert.match(text, /뉴욕.*20:00.*21:00/);
});
test('소문자 속성·파라미터와 종료 없는 순간 일정을 표준에 맞게 읽습니다', () => {
  const parsed = parseIcs('begin:vcalendar\nbegin:vevent\ndtstart;tzid=America/New_York:20261118T100000\nsummary:순간 일정\nend:vevent\nbegin:vevent\ndtstart:20261118T010000Z\nstatus:cancelled\nend:vevent\nbegin:vevent\ndtstart:20261118T010000Z\ntransp:transparent\nend:vevent\nend:vcalendar', 'Asia/Seoul');
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].start, Date.parse('2026-11-18T15:00Z'));
  assert.equal(parsed.events[0].end, parsed.events[0].start);
});
test('자정이 없는 DST 전환 전후의 종일 일정을 가져옵니다', () => {
  const parsed = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20260905\nSUMMARY:전날\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20260906\nSUMMARY:전환일\nEND:VEVENT\nEND:VCALENDAR', 'America/Santiago');
  assert.equal(parsed.skipped, 0);
  assert.equal(parsed.events[0].start, Date.parse('2026-09-05T04:00Z'));
  assert.equal(parsed.events[0].end, Date.parse('2026-09-06T04:00Z'));
  assert.equal(parsed.events[1].end, Date.parse('2026-09-07T03:00Z'));
});
test('알림 컴포넌트의 DURATION과 DESCRIPTION을 일정 속성으로 읽지 않습니다', () => {
  const parsed = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261118\nSUMMARY:하루\nBEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:알림 전용 메모\nTRIGGER:-PT15M\nDURATION:PT15M\nREPEAT:2\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR', 'Asia/Seoul');
  assert.equal(parsed.skipped, 0);
  assert.equal(parsed.events[0].notes, '');
});
