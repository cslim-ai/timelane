import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLocations, getLocation, displayLocation } from '../src/locations.js';

test('한국어·영어·IANA 식별자로 도시를 찾습니다', () => {
  for (const query of ['서울', 'seoul', 'Asia/Seoul']) assert.equal(searchLocations(query)[0].zone, 'Asia/Seoul');
  assert.equal(searchLocations('뉴욕')[0].zone, 'America/New_York');
  assert.equal(searchLocations('카트만두')[0].zone, 'Asia/Katmandu');
});
test('도시 이름이 같은 지역은 고유 식별자로 구분합니다', () => {
  assert.equal(getLocation('sydney').zone, 'Australia/Sydney');
  assert.equal(searchLocations('UTC')[0].zone, 'UTC');
  assert.ok(searchLocations('Pacific/Chatham').some(item => item.zone === 'Pacific/Chatham'));
});
test('빈 검색어는 주요 도시를 제안하고 검색 결과 수를 제한합니다', () => {
  assert.ok(searchLocations('').length > 0);
  assert.ok(searchLocations('a').length <= 20);
  assert.deepEqual(searchLocations('존재하지않는도시123'), []);
});
test('화면의 도시·국가 이름은 영어와 한국어로 바뀌고 저장 식별자는 유지됩니다', () => {
  const city = getLocation('seoul');
  const english = displayLocation(city, 'en-US');
  const korean = displayLocation(city, 'ko-KR');
  assert.deepEqual([english.id, english.zone, english.name, english.country], ['seoul', 'Asia/Seoul', 'Seoul', 'South Korea']);
  assert.deepEqual([korean.id, korean.zone, korean.name, korean.country], ['seoul', 'Asia/Seoul', '서울', '대한민국']);
  const newYork = displayLocation(searchLocations('뉴욕')[0], 'en-US');
  assert.equal(newYork.name, 'New York');
  assert.equal(newYork.country, 'United States');
  assert.equal(displayLocation(getLocation('tz:Etc/GMT-9'), 'en-US').country, 'Fixed offset');
});
