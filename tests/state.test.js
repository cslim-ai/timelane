import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, validateState, encodeShare, decodeShare, persistState, STORAGE_KEY, createShareUrl, createSettingsBackup } from '../src/state.js';

test('기본 상태를 검증하며 외부 객체를 참조하지 않습니다', () => {
  const source = createState(Date.parse('2026-11-18T01:00Z'));
  const clean = validateState(source);
  clean.groups[0].locations[0].label = '다른 이름';
  assert.equal(source.groups[0].locations[0].label, '');
  assert.equal(clean.date, '2026-11-18');
});
test('깨진 상태와 과도한 구간 및 알 수 없는 시간대를 거부합니다', () => {
  for (const mutate of [
    s => { s.version = 99; }, s => { s.date = '2026-02-30'; },
    s => { s.groups[0].locations[0].id = '<script>'; },
    s => { s.groups[0].locations[0].workEnd = -1; },
    s => { s.selection = { start: 1, end: 1e15 }; },
    s => { s.groups[0].locations.push(s.groups[0].locations[0]); },
    s => { s.activeGroupId = 'unknown'; },
  ]) {
    const state = createState(); mutate(state); assert.throws(() => validateState(state));
  }
});
test('한글 일정과 업무시간이 공유 링크에서 복원되고 다른 그룹은 제외됩니다', () => {
  const state = createState(); state.title = '서울 ↔ 뉴욕 회의';
  state.groups.push({ id: 'private', name: '개인 그룹', locations: [structuredClone(state.groups[0].locations[0])] });
  const restored = decodeShare(encodeShare(state));
  assert.equal(restored.title, '서울 ↔ 뉴욕 회의');
  assert.equal(restored.groups.length, 1);
  assert.deepEqual(restored.groups[0].locations, state.groups[0].locations);
  assert.throws(() => decodeShare('???'));
  assert.throws(() => decodeShare('a'.repeat(100_000)));
});
test('공유 화면을 편집해도 기존 개인 그룹 저장소를 덮어쓰지 않습니다', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value) };
  const personal = createState(); personal.groups[0].name = '내 개인 그룹';
  persistState(storage, personal, false);
  const before = values.get(STORAGE_KEY);
  const shared = createState(); shared.groups[0].name = '공유받은 그룹';
  assert.equal(persistState(storage, shared, true), false);
  assert.equal(values.get(STORAGE_KEY), before);
  shared.title = '공유 화면에서 편집한 일정';
  persistState(storage, shared, true);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).groups[0].name, '내 개인 그룹');
});
test('홈 도시에서 존재하지 않는 표시 날짜는 공유 진입 전에 거부합니다', () => {
  const state = createState(); state.date = '2011-12-30';
  state.groups[0].locations[0].id = 'tz:Pacific/Apia';
  assert.throws(() => validateState(state), /건너뛴/);
});
test('파일 실행의 공유 주소가 null origin 없이 한글·공백 경로와 일정을 보존합니다', () => {
  const state = createState(); state.title = '파일에서 만든 회의';
  const url = new URL(createShareUrl('file:///D:/내 도구/TimeLane/index.html#old', state));
  assert.equal(url.protocol, 'file:');
  assert.equal(decodeURIComponent(url.pathname), '/D:/내 도구/TimeLane/index.html');
  assert.equal(decodeShare(url.hash.slice(6)).title, '파일에서 만든 회의');
  assert.equal(url.href.includes('null'), false);
});
test('서버 실행에서도 공유 주소의 포트와 쿼리를 유지합니다', () => {
  const url = new URL(createShareUrl('http://127.0.0.1:4317/index.html?mode=local#old', createState()));
  assert.equal(url.origin, 'http://127.0.0.1:4317');
  assert.equal(url.search, '?mode=local');
  assert.equal(decodeShare(url.hash.slice(6)).groups.length, 1);
});
test('파일 실행의 저장소가 차단되어도 현재 설정으로 복구용 백업을 만듭니다', () => {
  const state = createState(); state.title = '현재 탭의 일정';
  const backup = createSettingsBackup(state, () => { throw new DOMException('저장소 차단', 'SecurityError'); });
  assert.equal(JSON.parse(backup.content).title, '현재 탭의 일정');
  assert.equal(backup.storageAvailable, false);
  const old = JSON.stringify({ ...state, title: '저장된 기존 일정' });
  assert.equal(createSettingsBackup(state, () => old).content, old);
});
