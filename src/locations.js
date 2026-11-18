// 검색어/국가 메타데이터를 주요 도시에 제공하고 나머지 IANA 지역도 검색합니다.
const rows = `seoul|서울|Seoul|대한민국|Asia/Seoul|ko-KR|Seoul Korea KST 서울 인천 부산
tokyo|도쿄|Tokyo|일본|Asia/Tokyo|ja-JP|Tokyo Japan JST 동경
osaka|오사카|Osaka|일본|Asia/Tokyo|ja-JP|Osaka
new-york|뉴욕|New York|미국|America/New_York|en-US|New York NYC USA EST EDT
los-angeles|로스앤젤레스|Los Angeles|미국|America/Los_Angeles|en-US|Los Angeles LA California PST PDT
san-francisco|샌프란시스코|San Francisco|미국|America/Los_Angeles|en-US|San Francisco SF 실리콘밸리
london|런던|London|영국|Europe/London|en-GB|London UK England GMT BST
paris|파리|Paris|프랑스|Europe/Paris|fr-FR|Paris France CET CEST
berlin|베를린|Berlin|독일|Europe/Berlin|de-DE|Berlin Germany
sydney|시드니|Sydney|호주|Australia/Sydney|en-AU|Sydney Australia AEST AEDT
melbourne|멜버른|Melbourne|호주|Australia/Melbourne|en-AU|Melbourne
brisbane|브리즈번|Brisbane|호주|Australia/Brisbane|en-AU|Brisbane
perth|퍼스|Perth|호주|Australia/Perth|en-AU|Perth
adelaide|애들레이드|Adelaide|호주|Australia/Adelaide|en-AU|Adelaide
auckland|오클랜드|Auckland|뉴질랜드|Pacific/Auckland|en-NZ|Auckland New Zealand
wellington|웰링턴|Wellington|뉴질랜드|Pacific/Auckland|en-NZ|Wellington
singapore|싱가포르|Singapore|싱가포르|Asia/Singapore|en-SG|Singapore SGT
hong-kong|홍콩|Hong Kong|중국|Asia/Hong_Kong|zh-HK|Hong Kong HKT
shanghai|상하이|Shanghai|중국|Asia/Shanghai|zh-CN|Shanghai China CST
beijing|베이징|Beijing|중국|Asia/Shanghai|zh-CN|Beijing 북경
taipei|타이베이|Taipei|대만|Asia/Taipei|zh-TW|Taipei Taiwan
bangkok|방콕|Bangkok|태국|Asia/Bangkok|th-TH|Bangkok Thailand
hanoi|하노이|Hanoi|베트남|Asia/Bangkok|vi-VN|Hanoi Vietnam
ho-chi-minh|호찌민|Ho Chi Minh City|베트남|Asia/Saigon|vi-VN|Ho Chi Minh Saigon 호치민
manila|마닐라|Manila|필리핀|Asia/Manila|en-PH|Manila Philippines
jakarta|자카르타|Jakarta|인도네시아|Asia/Jakarta|id-ID|Jakarta Indonesia
bali|발리|Bali|인도네시아|Asia/Makassar|id-ID|Bali Denpasar
kuala-lumpur|쿠알라룸푸르|Kuala Lumpur|말레이시아|Asia/Kuala_Lumpur|ms-MY|Kuala Lumpur Malaysia
kolkata|콜카타|Kolkata|인도|Asia/Calcutta|en-IN|Kolkata Calcutta India IST
mumbai|뭄바이|Mumbai|인도|Asia/Calcutta|en-IN|Mumbai Bombay
delhi|뉴델리|New Delhi|인도|Asia/Calcutta|en-IN|New Delhi
bengaluru|벵갈루루|Bengaluru|인도|Asia/Calcutta|en-IN|Bengaluru Bangalore 방갈로르
kathmandu|카트만두|Kathmandu|네팔|Asia/Katmandu|ne-NP|Kathmandu Nepal
dhaka|다카|Dhaka|방글라데시|Asia/Dhaka|bn-BD|Dhaka Bangladesh
karachi|카라치|Karachi|파키스탄|Asia/Karachi|en-PK|Karachi Pakistan
colombo|콜롬보|Colombo|스리랑카|Asia/Colombo|en-LK|Colombo Sri Lanka
dubai|두바이|Dubai|아랍에미리트|Asia/Dubai|en-AE|Dubai UAE
riyadh|리야드|Riyadh|사우디아라비아|Asia/Riyadh|ar-SA|Riyadh Saudi Arabia
doha|도하|Doha|카타르|Asia/Qatar|ar-QA|Doha Qatar
tehran|테헤란|Tehran|이란|Asia/Tehran|fa-IR|Tehran Iran
jerusalem|예루살렘|Jerusalem|이스라엘|Asia/Jerusalem|he-IL|Jerusalem Israel Tel Aviv 텔아비브
istanbul|이스탄불|Istanbul|튀르키예|Europe/Istanbul|tr-TR|Istanbul Turkey
moscow|모스크바|Moscow|러시아|Europe/Moscow|ru-RU|Moscow Russia MSK
vladivostok|블라디보스토크|Vladivostok|러시아|Asia/Vladivostok|ru-RU|Vladivostok
madrid|마드리드|Madrid|스페인|Europe/Madrid|es-ES|Madrid Spain
rome|로마|Rome|이탈리아|Europe/Rome|it-IT|Rome Italy
amsterdam|암스테르담|Amsterdam|네덜란드|Europe/Amsterdam|nl-NL|Amsterdam Netherlands
zurich|취리히|Zürich|스위스|Europe/Zurich|de-CH|Zurich Switzerland
stockholm|스톡홀름|Stockholm|스웨덴|Europe/Stockholm|sv-SE|Stockholm Sweden
oslo|오슬로|Oslo|노르웨이|Europe/Oslo|nb-NO|Oslo Norway
copenhagen|코펜하겐|Copenhagen|덴마크|Europe/Copenhagen|da-DK|Copenhagen Denmark
helsinki|헬싱키|Helsinki|핀란드|Europe/Helsinki|fi-FI|Helsinki Finland
warsaw|바르샤바|Warsaw|폴란드|Europe/Warsaw|pl-PL|Warsaw Poland
prague|프라하|Prague|체코|Europe/Prague|cs-CZ|Prague Czech
vienna|빈|Vienna|오스트리아|Europe/Vienna|de-AT|Vienna Austria 비엔나
lisbon|리스본|Lisbon|포르투갈|Europe/Lisbon|pt-PT|Lisbon Portugal
dublin|더블린|Dublin|아일랜드|Europe/Dublin|en-IE|Dublin Ireland
athens|아테네|Athens|그리스|Europe/Athens|el-GR|Athens Greece
kyiv|키이우|Kyiv|우크라이나|Europe/Kiev|uk-UA|Kyiv Kiev Ukraine 키예프
bucharest|부쿠레슈티|Bucharest|루마니아|Europe/Bucharest|ro-RO|Bucharest Romania
cairo|카이로|Cairo|이집트|Africa/Cairo|ar-EG|Cairo Egypt
johannesburg|요하네스버그|Johannesburg|남아프리카공화국|Africa/Johannesburg|en-ZA|Johannesburg South Africa
cape-town|케이프타운|Cape Town|남아프리카공화국|Africa/Johannesburg|en-ZA|Cape Town
nairobi|나이로비|Nairobi|케냐|Africa/Nairobi|sw-KE|Nairobi Kenya
lagos|라고스|Lagos|나이지리아|Africa/Lagos|en-NG|Lagos Nigeria
accra|아크라|Accra|가나|Africa/Accra|en-GH|Accra Ghana
casablanca|카사블랑카|Casablanca|모로코|Africa/Casablanca|ar-MA|Casablanca Morocco
chicago|시카고|Chicago|미국|America/Chicago|en-US|Chicago CST CDT
denver|덴버|Denver|미국|America/Denver|en-US|Denver MST MDT
phoenix|피닉스|Phoenix|미국|America/Phoenix|en-US|Phoenix Arizona
seattle|시애틀|Seattle|미국|America/Los_Angeles|en-US|Seattle Washington
boston|보스턴|Boston|미국|America/New_York|en-US|Boston
washington|워싱턴|Washington, DC|미국|America/New_York|en-US|Washington DC
miami|마이애미|Miami|미국|America/New_York|en-US|Miami Florida
honolulu|호놀룰루|Honolulu|미국|Pacific/Honolulu|en-US|Honolulu Hawaii 하와이
anchorage|앵커리지|Anchorage|미국|America/Anchorage|en-US|Anchorage Alaska
toronto|토론토|Toronto|캐나다|America/Toronto|en-CA|Toronto Canada
vancouver|밴쿠버|Vancouver|캐나다|America/Vancouver|en-CA|Vancouver
montreal|몬트리올|Montréal|캐나다|America/Toronto|fr-CA|Montreal
mexico-city|멕시코시티|Mexico City|멕시코|America/Mexico_City|es-MX|Mexico City
bogota|보고타|Bogotá|콜롬비아|America/Bogota|es-CO|Bogota Colombia
lima|리마|Lima|페루|America/Lima|es-PE|Lima Peru
sao-paulo|상파울루|São Paulo|브라질|America/Sao_Paulo|pt-BR|Sao Paulo Brazil
buenos-aires|부에노스아이레스|Buenos Aires|아르헨티나|America/Buenos_Aires|es-AR|Buenos Aires Argentina
santiago|산티아고|Santiago|칠레|America/Santiago|es-CL|Santiago Chile
reykjavik|레이캬비크|Reykjavík|아이슬란드|Atlantic/Reykjavik|is-IS|Reykjavik Iceland
utc|UTC|UTC|협정 세계시|UTC|en-GB|UTC GMT Zulu 협정 세계시`;

const regionNames = new Intl.DisplayNames('en-US', { type: 'region' });
export const locations = rows.split('\n').map(row => {
  const [id, name, englishName, country, zone, locale, aliases] = row.split('|');
  const region = id === 'hong-kong' ? 'CN' : new Intl.Locale(locale).region;
  const englishCountry = id === 'utc' ? 'Coordinated Universal Time' : regionNames.of(region);
  return { id, name, englishName, country, englishCountry, zone, aliases };
});
const koreanAreas = {
  Africa: '아프리카', America: '아메리카', Antarctica: '남극', Arctic: '북극', Asia: '아시아',
  Atlantic: '대서양', Australia: '호주', Europe: '유럽', Indian: '인도양', Pacific: '태평양',
};
const knownZones = new Set(locations.map(l => l.zone));
for (const zone of Intl.supportedValuesOf('timeZone')) {
  if (knownZones.has(zone)) continue;
  const area = zone.split('/')[0];
  const name = zone.split('/').at(-1).replaceAll('_', ' ');
  locations.push({ id: `tz:${zone}`, name, englishName: name, country: koreanAreas[area] ?? area, englishCountry: area, zone, aliases: zone });
}
for (let offset = -12; offset <= 14; offset++) {
  if (!offset) continue;
  const zone = `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    const name = `UTC${offset > 0 ? '+' : ''}${offset}`;
    locations.push({ id: `tz:${zone}`, name, englishName: name, country: '고정 시차', englishCountry: 'Fixed offset', zone, aliases: zone });
  } catch { /* IANA에서 제공하지 않는 고정 시차는 목록에 추가하지 않습니다. */ }
}
const byId = new Map(locations.map(l => [l.id, l]));
export function getLocation(id) { return byId.get(id); }
export function displayLocation(place, locale) {
  return locale === 'ko-KR' ? place : { ...place, name: place.englishName, country: place.englishCountry };
}
function normalize(text) { return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim(); }
export function searchLocations(query, limit = 20) {
  const q = normalize(String(query)).replaceAll('kathmandu', 'katmandu').replaceAll('kolkata', 'calcutta');
  if (!q) return locations.slice(0, 8);
  return locations.map((item, index) => {
    const name = normalize(`${item.name} ${item.englishName} ${item.aliases} ${item.zone} ${item.country} ${item.englishCountry}`).replaceAll('kathmandu', 'katmandu').replaceAll('kolkata', 'calcutta');
    const match = name.indexOf(q);
    const exact = [item.name, item.englishName, item.zone].some(label => normalize(label) === q);
    return { item, score: match < 0 ? Infinity : exact ? -2 : match === 0 ? -1 : match, index };
  }).filter(result => Number.isFinite(result.score)).sort((a, b) => a.score - b.score || a.index - b.index).slice(0, limit).map(result => result.item);
}
