export function selectLocale(tag) {
  if (typeof tag !== 'string' || !tag) return 'en-US';
  try {
    const { language, region } = new Intl.Locale(tag);
    return language === 'ko' || region === 'KR' ? 'ko-KR' : 'en-US';
  } catch {
    return 'en-US';
  }
}

export const messages = {
  'en-US': {
    title: 'TimeLane · World Clock',
    description: 'Compare local times around the world with Seoul as a reference.',
    skipToTimeline: 'Skip to timeline',
    home: 'TimeLane home',
    worldClock: 'World Clock',
    seoulLive: 'Seoul local time',
    clockSource: 'Time source',
    clockDeviceSource: 'Time from this device’s system clock.',
    clockServerSource: 'Synced with the UTCTime time server.',
    worldComparison: 'Compare world times',
    searchPlaceholder: 'Add a city or time zone',
    searchLabel: 'Search cities and time zones',
    searchResults: 'City search results',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    comparisonDate: 'Comparison date',
    timeFormat: 'Time format',
    twentyFourHours: '24-hour',
    twelveHours: '12-hour',
    seoulReference: 'Seoul reference',
    now: 'Now',
    returnToNow: 'Return to current time',
    cityComparison: 'Compare times by city',
    day: 'Day',
    evening: 'Evening',
    night: 'Night',
    cityLocalTime: 'City · Local time',
    axisCurrent: 'Now',
    axisSelected: 'Selected',
    comparisonHint: 'Click an hour to center it. Drag or scroll over the timeline to browse.',
    saved: 'Your cities are saved in this browser.',
    storageUnavailable: 'Browser storage is unavailable. Changes last only in this tab.',
    loadError: 'Your cities could not be loaded. The default list is shown.',
    actionError: 'This action could not be completed.',
    invalidDate: 'Choose a valid date from 1900 to 2100.',
    noResults: 'No results. Try a city name or IANA time zone.',
    cityLimit: limit => `You can add up to ${limit} cities, including Seoul.`,
    moveUp: city => `Move ${city} up`,
    moveDown: city => `Move ${city} down`,
    removeCity: city => `Remove ${city}`,
    timelineFor: city => `${city} timeline`,
    comparing: (date, time) => `Comparing ${date}, ${time} in Seoul`,
    morning: 'AM',
    afternoon: 'PM',
  },
  'ko-KR': {
    title: 'TimeLane · 세계 시계',
    description: '서울을 기준으로 세계 시간을 간편하게 비교하는 TimeLane.',
    skipToTimeline: '시간표로 이동',
    home: 'TimeLane 처음으로',
    worldClock: '세계 시계',
    seoulLive: '서울 현재 시각',
    clockSource: '시각 출처',
    clockDeviceSource: '이 기기의 시스템 시계에서 가져온 시각입니다.',
    clockServerSource: 'UTCTime 시간 서버와 동기화한 시각입니다.',
    worldComparison: '세계 시간 비교',
    searchPlaceholder: '도시 또는 시간대 추가',
    searchLabel: '도시 또는 시간대 검색',
    searchResults: '도시 검색 결과',
    previousDay: '이전 날짜',
    nextDay: '다음 날짜',
    comparisonDate: '비교 날짜',
    timeFormat: '시간 표시 형식',
    twentyFourHours: '24시간',
    twelveHours: '12시간',
    seoulReference: '서울 기준',
    now: '현재로',
    returnToNow: '현재 시각으로 돌아가기',
    cityComparison: '도시별 시간 비교',
    day: '낮',
    evening: '저녁',
    night: '밤',
    cityLocalTime: '도시 · 현지 시각',
    axisCurrent: '현재',
    axisSelected: '선택',
    comparisonHint: '시간 칸을 클릭해 가운데에 놓으세요. 시간표는 드래그하거나 휠을 돌려 이동할 수 있습니다.',
    saved: '도시 목록은 이 브라우저에 저장됩니다.',
    storageUnavailable: '브라우저 저장소를 사용할 수 없어 변경 내용은 현재 탭에서만 유지됩니다.',
    loadError: '도시 목록을 읽을 수 없어 기본 화면을 열었습니다.',
    actionError: '작업을 완료할 수 없습니다.',
    invalidDate: '1900년부터 2100년 사이의 올바른 날짜를 선택해 주세요.',
    noResults: '검색 결과가 없습니다. 도시 이름이나 IANA 시간대로 검색해 보세요.',
    cityLimit: limit => `도시는 서울을 포함해 최대 ${limit}개까지 추가할 수 있습니다.`,
    moveUp: city => `${city} 위로`,
    moveDown: city => `${city} 아래로`,
    removeCity: city => `${city} 삭제`,
    timelineFor: city => `${city} 시간표`,
    comparing: (date, time) => `서울 ${date} ${time} 비교 중`,
    morning: '오전',
    afternoon: '오후',
  },
};

export function applyTranslations(document, locale) {
  document.documentElement.lang = locale.split('-')[0];
  const translations = messages[locale];
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = translations[element.dataset.i18n];
  }
  for (const [suffix, attribute] of [['label', 'aria-label'], ['placeholder', 'placeholder'], ['content', 'content']]) {
    const keyAttribute = `data-i18n-${suffix}`;
    for (const element of document.querySelectorAll(`[${keyAttribute}]`)) {
      element.setAttribute(attribute, translations[element.getAttribute(keyAttribute)]);
    }
  }
}
