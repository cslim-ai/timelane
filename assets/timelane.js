// 자동 생성 파일입니다. 수정 후 node scripts/build-browser.mjs로 갱신하세요.
(() => {
'use strict';
const modules = Object.create(null);
// time.js
modules["time"] = (() => {
const formatters = new Map();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return formatters.get(zone);
}

function isTimeZone(zone) {
  if (typeof zone !== 'string' || zone.length > 100) return false;
  try { formatter(zone); return true; } catch { return false; }
}

function zonedParts(instant, zone) {
  const values = Object.fromEntries(formatter(zone).formatToParts(new Date(instant))
    .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  values.weekday = new Date(Date.UTC(values.year, values.month - 1, values.day)).getUTCDay();
  return values;
}

function dateString(instant, zone) {
  const p = zonedParts(instant, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
function pad(value) { return String(value).padStart(2, '0'); }
function offsetMilliseconds(instant, zone) {
  const p = zonedParts(instant, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}
function offsetMinutes(instant, zone) {
  return Math.round(offsetMilliseconds(instant, zone) / MINUTE);
}
function parseDate(date, boundary = false) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < (boundary ? 1899 : 1900) || year > (boundary ? 2101 : 2100) || check.toISOString().slice(0, 10) !== date) throw new Error('1900~2100년의 올바른 날짜를 선택해 주세요.');
  return { year, month, day };
}
function addDays(date, count) {
  const p = parseDate(date);
  const result = new Date(Date.UTC(p.year, p.month - 1, p.day + count)).toISOString().slice(0, 10);
  parseDate(result);
  return result;
}

// 가능한 UTC 오프셋을 수집한 뒤 현지 시각으로 역검증합니다.
// DST 간격은 거부하며 중복 시각은 earlier/later로 구분합니다.
function wallToInstant(date, time, zone, disambiguation = 'earlier') {
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

function startOfDay(date, zone) {
  for (let minute = 0; minute < 24 * 60; minute += 15) {
    try { return wallToInstant(date, `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, zone); }
    catch (error) { if (!error.message.includes('존재하지')) throw error; }
  }
  throw new Error('시간대 변경으로 이 지역에서 건너뛴 날짜입니다. 다른 날짜를 선택해 주세요.');
}
function daySlots(date, zone) {
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

function nextTransition(instant, zone, days = 7) {
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

function utcOffset(instant, zone) {
  const offset = offsetMinutes(instant, zone);
  return `UTC${offset >= 0 ? '+' : '−'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
function zoneAbbreviation(instant, zone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(instant).find(p => p.type === 'timeZoneName').value;
}
function formatTime(instant, zone, format = '24', locale = 'ko-KR', showSeconds = false) {
  return new Intl.DateTimeFormat(format === 'mx' ? locale : format === '12' ? 'en-US' : 'en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined,
    ...(format === 'mx' ? {} : { hour12: format === '12' }), hourCycle: format === '24' ? 'h23' : undefined,
  }).format(instant);
}
function shortDate(instant, zone) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: zone, month: 'numeric', day: 'numeric', weekday: 'short' }).format(instant);
}
function isWorkingTime(instant, location) {
  const p = zonedParts(instant, location.zone);
  const minute = p.hour * 60 + p.minute;
  const overnight = location.workStart > location.workEnd;
  const workday = overnight && minute < location.workEnd ? (p.weekday + 6) % 7 : p.weekday;
  if (location.weekend.includes(workday)) return false;
  return location.workStart < location.workEnd
    ? minute >= location.workStart && minute < location.workEnd
    : minute >= location.workStart || minute < location.workEnd;
}
return { MINUTE, HOUR, isTimeZone, zonedParts, dateString, pad, offsetMinutes, parseDate, addDays, wallToInstant, startOfDay, daySlots, nextTransition, utcOffset, zoneAbbreviation, formatTime, shortDate, isWorkingTime };
})();

// locations.js
modules["locations"] = (() => {
// 검색어/국가 메타데이터를 주요 도시에 제공하고 나머지 IANA 지역도 검색합니다.
const rows = `seoul|서울|대한민국|Asia/Seoul|ko-KR|Seoul Korea KST 서울 인천 부산
tokyo|도쿄|일본|Asia/Tokyo|ja-JP|Tokyo Japan JST 동경
osaka|오사카|일본|Asia/Tokyo|ja-JP|Osaka
new-york|뉴욕|미국|America/New_York|en-US|New York NYC USA EST EDT
los-angeles|로스앤젤레스|미국|America/Los_Angeles|en-US|Los Angeles LA California PST PDT
san-francisco|샌프란시스코|미국|America/Los_Angeles|en-US|San Francisco SF 실리콘밸리
london|런던|영국|Europe/London|en-GB|London UK England GMT BST
paris|파리|프랑스|Europe/Paris|fr-FR|Paris France CET CEST
berlin|베를린|독일|Europe/Berlin|de-DE|Berlin Germany
sydney|시드니|호주|Australia/Sydney|en-AU|Sydney Australia AEST AEDT
melbourne|멜버른|호주|Australia/Melbourne|en-AU|Melbourne
brisbane|브리즈번|호주|Australia/Brisbane|en-AU|Brisbane
perth|퍼스|호주|Australia/Perth|en-AU|Perth
adelaide|애들레이드|호주|Australia/Adelaide|en-AU|Adelaide
auckland|오클랜드|뉴질랜드|Pacific/Auckland|en-NZ|Auckland New Zealand
wellington|웰링턴|뉴질랜드|Pacific/Auckland|en-NZ|Wellington
singapore|싱가포르|싱가포르|Asia/Singapore|en-SG|Singapore SGT
hong-kong|홍콩|중국|Asia/Hong_Kong|zh-HK|Hong Kong HKT
shanghai|상하이|중국|Asia/Shanghai|zh-CN|Shanghai China CST
beijing|베이징|중국|Asia/Shanghai|zh-CN|Beijing 북경
taipei|타이베이|대만|Asia/Taipei|zh-TW|Taipei Taiwan
bangkok|방콕|태국|Asia/Bangkok|th-TH|Bangkok Thailand
hanoi|하노이|베트남|Asia/Bangkok|vi-VN|Hanoi Vietnam
ho-chi-minh|호찌민|베트남|Asia/Saigon|vi-VN|Ho Chi Minh Saigon 호치민
manila|마닐라|필리핀|Asia/Manila|en-PH|Manila Philippines
jakarta|자카르타|인도네시아|Asia/Jakarta|id-ID|Jakarta Indonesia
bali|발리|인도네시아|Asia/Makassar|id-ID|Bali Denpasar
kuala-lumpur|쿠알라룸푸르|말레이시아|Asia/Kuala_Lumpur|ms-MY|Kuala Lumpur Malaysia
kolkata|콜카타|인도|Asia/Calcutta|en-IN|Kolkata Calcutta India IST
mumbai|뭄바이|인도|Asia/Calcutta|en-IN|Mumbai Bombay
delhi|뉴델리|인도|Asia/Calcutta|en-IN|New Delhi
bengaluru|벵갈루루|인도|Asia/Calcutta|en-IN|Bengaluru Bangalore 방갈로르
kathmandu|카트만두|네팔|Asia/Katmandu|ne-NP|Kathmandu Nepal
dhaka|다카|방글라데시|Asia/Dhaka|bn-BD|Dhaka Bangladesh
karachi|카라치|파키스탄|Asia/Karachi|en-PK|Karachi Pakistan
colombo|콜롬보|스리랑카|Asia/Colombo|en-LK|Colombo Sri Lanka
dubai|두바이|아랍에미리트|Asia/Dubai|en-AE|Dubai UAE
riyadh|리야드|사우디아라비아|Asia/Riyadh|ar-SA|Riyadh Saudi Arabia
doha|도하|카타르|Asia/Qatar|ar-QA|Doha Qatar
tehran|테헤란|이란|Asia/Tehran|fa-IR|Tehran Iran
jerusalem|예루살렘|이스라엘|Asia/Jerusalem|he-IL|Jerusalem Israel Tel Aviv 텔아비브
istanbul|이스탄불|튀르키예|Europe/Istanbul|tr-TR|Istanbul Turkey
moscow|모스크바|러시아|Europe/Moscow|ru-RU|Moscow Russia MSK
vladivostok|블라디보스토크|러시아|Asia/Vladivostok|ru-RU|Vladivostok
madrid|마드리드|스페인|Europe/Madrid|es-ES|Madrid Spain
rome|로마|이탈리아|Europe/Rome|it-IT|Rome Italy
amsterdam|암스테르담|네덜란드|Europe/Amsterdam|nl-NL|Amsterdam Netherlands
zurich|취리히|스위스|Europe/Zurich|de-CH|Zurich Switzerland
stockholm|스톡홀름|스웨덴|Europe/Stockholm|sv-SE|Stockholm Sweden
oslo|오슬로|노르웨이|Europe/Oslo|nb-NO|Oslo Norway
copenhagen|코펜하겐|덴마크|Europe/Copenhagen|da-DK|Copenhagen Denmark
helsinki|헬싱키|핀란드|Europe/Helsinki|fi-FI|Helsinki Finland
warsaw|바르샤바|폴란드|Europe/Warsaw|pl-PL|Warsaw Poland
prague|프라하|체코|Europe/Prague|cs-CZ|Prague Czech
vienna|빈|오스트리아|Europe/Vienna|de-AT|Vienna Austria 비엔나
lisbon|리스본|포르투갈|Europe/Lisbon|pt-PT|Lisbon Portugal
dublin|더블린|아일랜드|Europe/Dublin|en-IE|Dublin Ireland
athens|아테네|그리스|Europe/Athens|el-GR|Athens Greece
kyiv|키이우|우크라이나|Europe/Kiev|uk-UA|Kyiv Kiev Ukraine 키예프
bucharest|부쿠레슈티|루마니아|Europe/Bucharest|ro-RO|Bucharest Romania
cairo|카이로|이집트|Africa/Cairo|ar-EG|Cairo Egypt
johannesburg|요하네스버그|남아프리카공화국|Africa/Johannesburg|en-ZA|Johannesburg South Africa
cape-town|케이프타운|남아프리카공화국|Africa/Johannesburg|en-ZA|Cape Town
nairobi|나이로비|케냐|Africa/Nairobi|sw-KE|Nairobi Kenya
lagos|라고스|나이지리아|Africa/Lagos|en-NG|Lagos Nigeria
accra|아크라|가나|Africa/Accra|en-GH|Accra Ghana
casablanca|카사블랑카|모로코|Africa/Casablanca|ar-MA|Casablanca Morocco
chicago|시카고|미국|America/Chicago|en-US|Chicago CST CDT
denver|덴버|미국|America/Denver|en-US|Denver MST MDT
phoenix|피닉스|미국|America/Phoenix|en-US|Phoenix Arizona
seattle|시애틀|미국|America/Los_Angeles|en-US|Seattle Washington
boston|보스턴|미국|America/New_York|en-US|Boston
washington|워싱턴|미국|America/New_York|en-US|Washington DC
miami|마이애미|미국|America/New_York|en-US|Miami Florida
honolulu|호놀룰루|미국|Pacific/Honolulu|en-US|Honolulu Hawaii 하와이
anchorage|앵커리지|미국|America/Anchorage|en-US|Anchorage Alaska
toronto|토론토|캐나다|America/Toronto|en-CA|Toronto Canada
vancouver|밴쿠버|캐나다|America/Vancouver|en-CA|Vancouver
montreal|몬트리올|캐나다|America/Toronto|fr-CA|Montreal
mexico-city|멕시코시티|멕시코|America/Mexico_City|es-MX|Mexico City
bogota|보고타|콜롬비아|America/Bogota|es-CO|Bogota Colombia
lima|리마|페루|America/Lima|es-PE|Lima Peru
sao-paulo|상파울루|브라질|America/Sao_Paulo|pt-BR|Sao Paulo Brazil
buenos-aires|부에노스아이레스|아르헨티나|America/Buenos_Aires|es-AR|Buenos Aires Argentina
santiago|산티아고|칠레|America/Santiago|es-CL|Santiago Chile
reykjavik|레이캬비크|아이슬란드|Atlantic/Reykjavik|is-IS|Reykjavik Iceland
utc|UTC|협정 세계시|UTC|en-GB|UTC GMT Zulu 협정 세계시`;

const locations = rows.split('\n').map(row => {
  const [id, name, country, zone, locale, aliases] = row.split('|');
  return { id, name, country, zone, locale, aliases };
});
const knownZones = new Set(locations.map(l => l.zone));
for (const zone of Intl.supportedValuesOf('timeZone')) {
  if (!knownZones.has(zone)) locations.push({ id: `tz:${zone}`, name: zone.split('/').at(-1).replaceAll('_', ' '), country: zone.split('/')[0], zone, locale: 'en-GB', aliases: zone });
}
for (let offset = -12; offset <= 14; offset++) {
  if (!offset) continue;
  const zone = `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    locations.push({ id: `tz:${zone}`, name: `UTC${offset > 0 ? '+' : ''}${offset}`, country: '고정 시차', zone, locale: 'en-GB', aliases: zone });
  } catch { /* IANA에서 제공하지 않는 고정 시차는 목록에 추가하지 않습니다. */ }
}
const byId = new Map(locations.map(l => [l.id, l]));
function getLocation(id) { return byId.get(id); }
function normalize(text) { return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim(); }
function searchLocations(query, limit = 20) {
  const q = normalize(String(query)).replaceAll('kathmandu', 'katmandu').replaceAll('kolkata', 'calcutta');
  if (!q) return locations.slice(0, 8);
  return locations.map((item, index) => {
    const name = normalize(`${item.name} ${item.aliases} ${item.zone} ${item.country}`).replaceAll('kathmandu', 'katmandu').replaceAll('kolkata', 'calcutta');
    const match = name.indexOf(q);
    return { item, score: match < 0 ? Infinity : normalize(item.name) === q || normalize(item.zone) === q ? -2 : match === 0 ? -1 : match, index };
  }).filter(result => Number.isFinite(result.score)).sort((a, b) => a.score - b.score || a.index - b.index).slice(0, limit).map(result => result.item);
}
return { locations, getLocation, searchLocations };
})();

// clock-state.js
modules["clock-state"] = (() => {
const { addDays, dateString, daySlots, parseDate } = modules["time"];
const { getLocation } = modules["locations"];

const SEOUL_ZONE = 'Asia/Seoul';
const CLOCK_STORAGE_KEY = 'timelane.clock.v2';
const LEGACY_STORAGE_KEY = 'timelane.v1';
const MAX_CITIES = 20;
const MIN_CLOCK_DATE = '1900-01-01';
const MAX_CLOCK_DATE = '2100-12-31';

function createClockState(now = Date.now()) {
  return { version: 2, locations: ['seoul', 'london', 'new-york', 'san-francisco'], date: dateString(now, SEOUL_ZONE), format: '24' };
}
function validateClockState(input) {
  if (!input || input.version !== 2 || !Array.isArray(input.locations) || input.locations.length < 1 || input.locations.length > MAX_CITIES) throw new Error('도시 목록을 읽을 수 없습니다.');
  if (input.locations[0] !== 'seoul' || new Set(input.locations).size !== input.locations.length || input.locations.some(id => !getLocation(id))) throw new Error('서울이 첫 번째에 있어야 하며 올바른 도시를 중복 없이 선택해야 합니다.');
  if (!['12', '24'].includes(input.format)) throw new Error('12시간 또는 24시간 형식을 선택해 주세요.');
  parseDate(input.date);
  return { version: 2, locations: [...input.locations], date: input.date, format: input.format };
}
function loadClockState(storage, now = Date.now()) {
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
function saveClockState(storage, state) {
  storage.setItem(CLOCK_STORAGE_KEY, JSON.stringify(validateClockState(state)));
}
function reorderCities(ids, id, targetIndex) {
  const result = [...ids];
  if (id === 'seoul') return result;
  const current = result.indexOf(id);
  if (current < 1 || !Number.isInteger(targetIndex)) throw new Error('이동할 도시를 찾을 수 없습니다.');
  result.splice(current, 1);
  result.splice(Math.max(1, Math.min(targetIndex, result.length)), 0, id);
  return result;
}
function clockWindow(instant, count, shift = 0) {
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
return { SEOUL_ZONE, CLOCK_STORAGE_KEY, LEGACY_STORAGE_KEY, MAX_CITIES, MIN_CLOCK_DATE, MAX_CLOCK_DATE, createClockState, validateClockState, loadClockState, saveClockState, reorderCities, clockWindow };
})();

// app.js
modules["app"] = (() => {
const { HOUR, MINUTE, zonedParts, dateString, pad, wallToInstant, addDays, formatTime, shortDate, utcOffset, zoneAbbreviation } = modules["time"];
const { getLocation, searchLocations } = modules["locations"];
const { SEOUL_ZONE, MAX_CITIES, MIN_CLOCK_DATE, MAX_CLOCK_DATE, createClockState, validateClockState, loadClockState, saveClockState, reorderCities, clockWindow } = modules["clock-state"];

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const maxVisibleHours = 25;
const dragThreshold = 8;
let state = createClockState(), slots = [], selectedInstant = null, hoverInstant = null;
let visibleHours, displayedWindow, followingNow = true;
let timelinePointer = null, suppressTimelineClick = false;
let searchItems = [], searchIndex = -1, toastTimer;
let startupNotice = '';
try { state = loadClockState(localStorage); }
catch { startupNotice = '도시 목록을 읽을 수 없어 기본 화면을 열었습니다. 기존 저장 데이터는 유지됩니다.'; }

function notify(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 7000 : 3500);
}
function on(id, event, handler) {
  $(id).addEventListener(event, ev => {
    try { handler(ev); }
    catch (error) { notify(error.message || '작업을 완료할 수 없습니다.', true); }
  });
}
function save() {
  try {
    saveClockState(localStorage, state);
    $('save-status').textContent = '도시 목록은 이 브라우저에 저장됩니다.';
  } catch {
    $('save-status').textContent = '브라우저 저장소를 사용할 수 없어 변경 내용은 현재 탭에서만 유지됩니다.';
  }
}
function commit(change) {
  const previous = structuredClone(state);
  try { change(); state = validateClockState(state); render(); save(); }
  catch (error) { state = previous; render(); throw error; }
}
function places() { return state.locations.map(getLocation); }
function percent(instant) {
  const start = slots[0].start - displayedWindow.emptyBefore * HOUR;
  const end = slots.at(-1).end + displayedWindow.emptyAfter * HOUR;
  return (instant - start) / (end - start) * 100;
}
function measureVisibleHours() {
  const dimensions = getComputedStyle($('timeline'));
  const cityWidth = Number.parseFloat(dimensions.getPropertyValue('--city-width'));
  const cellWidth = Number.parseFloat(dimensions.getPropertyValue('--column-width'));
  const available = $('timeline-scroll').clientWidth - cityWidth;
  const hours = Math.min(maxVisibleHours, Math.floor(available / cellWidth));
  // 가운데 한 칸의 양쪽에 같은 수의 시간 칸을 배치합니다.
  return Math.max(3, hours % 2 === 0 ? hours - 1 : hours);
}
function render(instant = displayedWindow?.center.start ?? Date.now(), shift = 0) {
  visibleHours = measureVisibleHours();
  displayedWindow = clockWindow(instant, visibleHours, shift);
  slots = displayedWindow.slots;
  state.date = displayedWindow.date;
  const date = zonedParts(displayedWindow.center.start, SEOUL_ZONE);
  $('date-label').textContent = `${date.year}. ${pad(date.month)}. ${pad(date.day)}. (${weekdays[date.weekday]})`;
  $('date-picker').value = state.date;
  $('time-format').value = state.format;
  $('reference-offset').textContent = utcOffset(displayedWindow.center.start, SEOUL_ZONE);
  $('previous-day').disabled = state.date === MIN_CLOCK_DATE;
  $('next-day').disabled = state.date === MAX_CLOCK_DATE;
  renderTimeline();
  const scroller = $('timeline-scroll');
  scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
  const now = Date.now();
  updateLiveTime(now);
  updateComparison(now);
}
function hourLabel(instant, place) {
  const p = zonedParts(instant, place.zone);
  const hour = state.format === '12' ? p.hour % 12 || 12 : pad(p.hour);
  return `<span class="hour-number">${hour}${p.minute ? `<span class="minute">:${pad(p.minute)}</span>` : ''}</span>${state.format === '12' ? `<span class="period">${p.hour < 12 ? 'am' : 'pm'}</span>` : ''}`;
}
function renderTimeline() {
  const timeline = $('timeline');
  const { emptyBefore, emptyAfter } = displayedWindow;
  const before = '<span class="empty-hour" aria-hidden="true"></span>'.repeat(emptyBefore);
  const after = '<span class="empty-hour" aria-hidden="true"></span>'.repeat(emptyAfter);
  const tracks = slots.map(slot => `minmax(0, ${(slot.end - slot.start) / MINUTE}fr)`).join(' ');
  const emptyTrack = 'minmax(0, 60fr) ';
  timeline.style.setProperty('--columns', visibleHours);
  timeline.style.setProperty('--slot-tracks', `${emptyTrack.repeat(emptyBefore)}${tracks} ${emptyTrack.repeat(emptyAfter)}`);
  timeline.innerHTML = `<div class="axis-row"><div class="axis-label">도시 · 현지 시각</div><div class="axis-hours">${before}${slots.map((slot, index) => {
    const p = zonedParts(slot.start, SEOUL_ZONE);
    const hour = state.format === '12' ? p.hour % 12 || 12 : pad(p.hour);
    return `<span data-axis-cell="${index}">${hour}</span>`;
  }).join('')}${after}</div></div>` + places().map((place, rowIndex) => {
    const fixed = place.id === 'seoul';
    const name = escape(place.name);
    const controls = fixed ? '' : `<div class="row-controls">
      <button type="button" data-action="up" aria-label="${name} 위로"${rowIndex === 1 ? ' disabled' : ''}>↑</button>
      <button type="button" data-action="down" aria-label="${name} 아래로"${rowIndex === state.locations.length - 1 ? ' disabled' : ''}>↓</button>
      <button type="button" class="remove-city" data-action="remove" title="도시 삭제" aria-label="${name} 삭제">×</button>
    </div>`;
    return `<div class="city-row${fixed ? ' seoul-row' : ''}" data-id="${escape(place.id)}">
      <div class="city-info">
        <div class="city-identity"><strong class="city-name" title="${name}">${name}</strong><p class="city-zone">${escape(place.country)}<span class="zone-abbreviation"></span></p></div>
        <div class="city-reading"><time class="city-clock"></time><p class="city-date"></p></div>
        ${controls}
      </div>
      <div class="lane" data-row="${rowIndex}" aria-label="${name} 시간표">${before}${slots.map((slot, index) => {
      const p = zonedParts(slot.start, place.zone);
      const phase = p.hour < 7 || p.hour >= 22 ? 'night' : p.hour >= 18 ? 'evening' : 'day';
      const dateChanged = index === 0 || dateString(slot.start, place.zone) !== dateString(slots[index - 1].start, place.zone);
      const label = `${place.name} ${shortDate(slot.start, place.zone)} ${formatTime(slot.start, place.zone, state.format)} ${utcOffset(slot.start, place.zone)}`;
      const tabIndex = slot.start === displayedWindow.center.start ? 0 : -1;
      return `<button type="button" class="time-cell ${phase}${dateChanged && index ? ' date-boundary' : ''}" data-cell="${index}" tabindex="${tabIndex}" aria-label="${escape(label)}" aria-pressed="false" title="${escape(label)}">${dateChanged ? `<span class="day-marker">${p.month}/${p.day}</span>` : ''}${hourLabel(slot.start, place)}</button>`;
    }).join('')}${after}<div class="comparison-band" hidden></div><div class="now-line" aria-hidden="true" hidden></div></div></div>`;
  }).join('');
}
function updateLiveTime(now) {
  const clock = $('live-time');
  clock.textContent = formatTime(now, SEOUL_ZONE, state.format, 'ko-KR', true);
  clock.dateTime = new Date(now).toISOString();

  const timeline = $('timeline');
  const currentSlot = slots.findIndex(slot => now >= slot.start && now < slot.end);
  const currentCells = `[data-axis-cell="${currentSlot}"], [data-cell="${currentSlot}"]`;
  for (const cell of timeline.querySelectorAll('[aria-current="time"]')) {
    if (!cell.matches(currentCells)) cell.removeAttribute('aria-current');
  }
  for (const cell of timeline.querySelectorAll(currentCells)) {
    if (!cell.hasAttribute('aria-current')) cell.setAttribute('aria-current', 'time');
  }

  const position = currentSlot < 0 ? 0 : percent(now);
  for (const line of timeline.querySelectorAll('.now-line')) {
    line.hidden = currentSlot < 0;
    if (!line.hidden) line.style.left = `${position}%`;
  }
}
function updateComparison(now = Date.now()) {
  const instant = hoverInstant ?? selectedInstant ?? now;
  const fixed = selectedInstant !== null;
  const comparing = hoverInstant !== null || fixed;
  // 행 교체 중 발생하는 focusout에서도 기존 DOM 행의 도시를 정확히 갱신합니다.
  document.querySelectorAll('.city-row').forEach(row => {
    const place = getLocation(row.dataset.id);
    row.querySelector('.city-clock').textContent = formatTime(instant, place.zone, state.format);
    row.querySelector('.city-date').textContent = shortDate(instant, place.zone);
    const abbreviation = zoneAbbreviation(instant, place.zone);
    row.querySelector('.zone-abbreviation').textContent = ` · ${abbreviation}`;
    row.querySelector('.city-zone').title = `${place.country} · ${abbreviation} (${place.zone})`;
  });
  const index = comparing ? slots.findIndex(slot => instant >= slot.start && instant < slot.end) : -1;
  document.querySelectorAll('.comparison-band').forEach(band => {
    band.hidden = index < 0;
    if (index < 0) return;
    band.style.left = `${percent(slots[index].start)}%`;
    band.style.width = `${percent(slots[index].end) - percent(slots[index].start)}%`;
    band.classList.toggle('locked', fixed && hoverInstant === null);
  });
  document.querySelectorAll('.time-cell').forEach(cell => {
    const selected = selectedInstant === slots[Number(cell.dataset.cell)]?.start;
    if (cell.getAttribute('aria-pressed') !== String(selected)) cell.setAttribute('aria-pressed', String(selected));
  });
  $('comparison-status').textContent = comparing ? `서울 ${shortDate(instant, SEOUL_ZONE)} ${formatTime(instant, SEOUL_ZONE, state.format)} 비교 중` : '시간 칸을 클릭해 가운데에 놓거나, 좌우로 끌어 이동하세요.';
}
function showWindowAt(instant, follow = false) {
  followingNow = follow;
  selectedInstant = null;
  hoverInstant = null;
  render(instant);
}
function changeDate(date) {
  if (date === dateString(Date.now(), SEOUL_ZONE)) returnToNow();
  else showWindowAt(wallToInstant(date, '12:00', SEOUL_ZONE));
}
function returnToNow() { showWindowAt(Date.now(), true); }

function selectTime(cell) {
  const instant = slots[Number(cell.dataset.cell)].start;
  const row = cell.closest('.lane').dataset.row;
  selectedInstant = instant;
  hoverInstant = null;
  followingNow = false;

  if (instant === displayedWindow.center.start) {
    updateComparison();
    return;
  }
  render(instant);
  const index = slots.findIndex(slot => slot.start === instant);
  $('timeline').querySelector(`.lane[data-row="${row}"] [data-cell="${index}"]`).focus({ preventScroll: true });
}

function beginTimelinePointer(event) {
  if (!event.isPrimary || event.button !== 0 || timelinePointer) return;
  suppressTimelineClick = false;
  const hours = event.target.closest('.lane, .axis-hours');
  if (!hours) return;
  timelinePointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    origin: displayedWindow.center.start,
    cellWidth: hours.getBoundingClientRect().width / visibleHours,
    shift: 0,
    dragging: false,
  };
}

function panTimeline(event) {
  const pointer = timelinePointer;
  if (pointer?.id !== event.pointerId) return;
  const distance = event.clientX - pointer.startX;
  if (!pointer.dragging) {
    if (Math.abs(distance) < dragThreshold || Math.abs(distance) <= Math.abs(event.clientY - pointer.startY)) return;
    $('timeline').setPointerCapture(pointer.id);
    $('timeline').classList.add('is-panning');
    pointer.dragging = true;
    suppressTimelineClick = true;
    hoverInstant = null;
    updateComparison();
  }
  event.preventDefault();

  // 손으로 시간표를 왼쪽으로 밀면 오른쪽에 있던 이후 시간이 나타납니다.
  const shift = -Math.sign(distance) * Math.round(Math.abs(distance) / pointer.cellWidth);
  if (shift === pointer.shift) return;
  pointer.shift = shift;
  followingNow = false;
  selectedInstant = null;
  render(pointer.origin, shift);
}

function endTimelinePointer(event) {
  if (timelinePointer?.id !== event.pointerId) return;
  timelinePointer = null;
  $('timeline').classList.remove('is-panning');
}

function showSearch() {
  searchItems = searchLocations($('city-search').value);
  searchIndex = -1;
  $('search-results').innerHTML = searchItems.length ? searchItems.map((place, index) => {
    const added = state.locations.includes(place.id);
    return `<button type="button" class="search-option" role="option" aria-selected="false" id="search-option-${index}" data-search-index="${index}"${added ? ' disabled' : ''}><span><strong>${escape(place.name)}</strong><small>${escape(place.country)} · ${escape(place.zone)}</small></span><span class="add-symbol" aria-hidden="true">${added ? '✓' : '+'}</span></button>`;
  }).join('') : '<p class="search-empty">검색 결과가 없습니다. 영문 도시나 시간대로도 검색해 보세요.</p>';
  $('search-results').hidden = false;
  $('city-search').setAttribute('aria-expanded', 'true');
  $('city-search').removeAttribute('aria-activedescendant');
}
function closeSearch() {
  $('search-results').hidden = true;
  $('city-search').setAttribute('aria-expanded', 'false');
  $('city-search').removeAttribute('aria-activedescendant');
}
function addCity(index) {
  const place = searchItems[index];
  if (!place || state.locations.includes(place.id)) return;
  if (state.locations.length >= MAX_CITIES) throw new Error(`도시는 서울을 포함해 최대 ${MAX_CITIES}개까지 추가할 수 있습니다.`);
  commit(() => state.locations.push(place.id));
  $('city-search').value = '';
  $('city-search').focus(); closeSearch();
}
on('city-search', 'focus', showSearch);
on('city-search', 'input', showSearch);
on('search-results', 'click', event => { const item = event.target.closest('[data-search-index]'); if (item) addCity(Number(item.dataset.searchIndex)); });
on('city-search', 'keydown', event => {
  if (event.key === 'Escape') { closeSearch(); return; }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if ($('search-results').hidden) showSearch();
    const options = [...$('search-results').querySelectorAll('.search-option')];
    const step = event.key === 'ArrowDown' ? 1 : -1;
    for (let count = 0; count < options.length; count++) {
      searchIndex = (searchIndex + step + options.length) % options.length;
      if (!options[searchIndex].disabled) break;
    }
    options.forEach((option, index) => { option.classList.toggle('highlighted', index === searchIndex); option.setAttribute('aria-selected', String(index === searchIndex)); });
    if (options[searchIndex]) { $('city-search').setAttribute('aria-activedescendant', options[searchIndex].id); options[searchIndex].scrollIntoView({ block: 'nearest' }); }
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    addCity(searchIndex < 0 ? searchItems.findIndex(place => !state.locations.includes(place.id)) : searchIndex);
  }
});
document.addEventListener('pointerdown', event => { if (!event.target.closest('.search-wrap')) closeSearch(); });
on('previous-day', 'click', () => changeDate(addDays(state.date, -1)));
on('next-day', 'click', () => changeDate(addDays(state.date, 1)));
on('current-time', 'click', returnToNow);
on('date-picker', 'change', event => {
  try { changeDate(event.target.value); }
  catch (error) { event.target.value = state.date; throw error; }
});
on('time-format', 'change', event => commit(() => { state.format = event.target.value; }));
on('timeline', 'pointerdown', beginTimelinePointer);
window.addEventListener('pointermove', panTimeline, { passive: false, capture: true });
window.addEventListener('pointerup', endTimelinePointer);
window.addEventListener('pointercancel', endTimelinePointer);
on('timeline', 'lostpointercapture', event => {
  if (event.target === $('timeline')) endTimelinePointer(event);
});
on('timeline', 'click', event => {
  if (suppressTimelineClick && event.detail > 0) {
    suppressTimelineClick = false;
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) {
    if (action.disabled) return;
    const id = action.closest('.city-row').dataset.id;
    if (id === 'seoul') return;
    const index = state.locations.indexOf(id);
    if (action.dataset.action === 'remove') commit(() => { state.locations = state.locations.filter(city => city !== id); });
    if (action.dataset.action === 'up' || action.dataset.action === 'down') {
      commit(() => { state.locations = reorderCities(state.locations, id, index + (action.dataset.action === 'up' ? -1 : 1)); });
      $('timeline').querySelector(`[data-id="${id}"] [data-action="${action.dataset.action}"]`)?.focus();
    }
    return;
  }
  const cell = event.target.closest('[data-cell]');
  if (cell) selectTime(cell);
});
on('timeline', 'pointermove', event => {
  if (timelinePointer || event.pointerType === 'touch') return;
  const cell = event.target.closest('[data-cell]');
  const instant = cell ? slots[Number(cell.dataset.cell)].start : null;
  if (instant !== hoverInstant) { hoverInstant = instant; updateComparison(); }
});
on('timeline', 'pointerleave', () => { hoverInstant = null; updateComparison(); });
on('timeline', 'focusin', event => {
  if (timelinePointer?.dragging) return;
  const cell = event.target.closest('[data-cell]');
  const instant = cell ? slots[Number(cell.dataset.cell)].start : null;
  hoverInstant = instant === selectedInstant ? null : instant;
  updateComparison();
});
on('timeline', 'focusout', event => { if (!$('timeline').contains(event.relatedTarget)) { hoverInstant = null; updateComparison(); } });
on('timeline', 'keydown', event => {
  const cell = event.target.closest('[data-cell]');
  if (!cell || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = Number(cell.dataset.cell);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? slots.length - 1 : Math.max(0, Math.min(slots.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
  const lane = cell.closest('.lane');
  lane.querySelectorAll('[data-cell]').forEach(button => { button.tabIndex = Number(button.dataset.cell) === next ? 0 : -1; });
  lane.querySelector(`[data-cell="${next}"]`).focus();
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('city-search').focus(); }
  if (event.key === 'Escape') { closeSearch(); selectedInstant = null; hoverInstant = null; updateComparison(); }
});
function tick() {
  if (document.hidden) return;
  const now = Date.now();
  const { start, end } = displayedWindow.center;
  if (followingNow && !timelinePointer && selectedInstant === null && hoverInstant === null && (now < start || now >= end)) {
    render(now);
    return;
  }
  updateLiveTime(now);
  updateComparison(now);
}
document.addEventListener('visibilitychange', tick);
const clock = setInterval(tick, 1000);
render();
const timelineResize = new ResizeObserver(() => { if (measureVisibleHours() !== visibleHours) render(); });
timelineResize.observe($('timeline-scroll'));
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  clearInterval(clock);
  timelineResize.disconnect();
});
if (startupNotice) { $('save-status').textContent = startupNotice; notify(startupNotice, true); }
return {  };
})();
})();
