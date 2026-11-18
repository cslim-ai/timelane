import { HOUR, MINUTE, zonedParts, dateString, pad, wallToInstant, addDays, formatTime, shortDate, utcOffset, zoneAbbreviation } from './time.js';
import { getLocation, searchLocations } from './locations.js';
import { SEOUL_ZONE, MAX_CITIES, MIN_CLOCK_DATE, MAX_CLOCK_DATE, createClockState, validateClockState, loadClockState, saveClockState, reorderCities, clockWindow } from './clock-state.js';

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
