import { HOUR, MINUTE, zonedParts, dateString, pad, wallToInstant, parseDate, addDays, formatTime, shortDate, utcOffset, zoneAbbreviation } from './time.js';
import { getLocation, searchLocations, displayLocation } from './locations.js';
import { SEOUL_ZONE, MAX_CITIES, MIN_CLOCK_DATE, MAX_CLOCK_DATE, createClockState, validateClockState, loadClockState, saveClockState, reorderCities, clockWindow } from './clock-state.js';
import { selectLocale, messages, applyTranslations } from './locale.js';
import { createCurrentClock } from './current-clock.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const locale = selectLocale(navigator.language || navigator.languages?.[0]);
const text = messages[locale];
const referenceDate = new Intl.DateTimeFormat(locale, { timeZone: SEOUL_ZONE, year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
const maxVisibleHours = 25;
const dragThreshold = 8;
const wheelPixelsPerHour = 100;
const wheelLinesPerHour = 3;
const syncInterval = 120_000;
const currentClock = createCurrentClock();
const clockSource = $('clock-source');
const clockSourceIcon = clockSource.querySelector('.clock-source-icon');
const initialTime = currentClock.now();
let state = createClockState(initialTime), slots = [], selectedInstant = null, hoverInstant = null;
let visibleHours, displayedWindow, followingNow = true;
let timelinePointer = null, suppressTimelineClick = false;
let wheelOffset = 0;
let searchItems = [], searchIndex = -1, toastTimer;
let startupNotice = '';
applyTranslations(document, locale);
try { state = loadClockState(localStorage, initialTime); }
catch { startupNotice = text.loadError; }

function notify(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 7000 : 3500);
}
function on(id, event, handler, options) {
  $(id).addEventListener(event, ev => {
    try { handler(ev); }
    catch (error) {
      console.error(error);
      notify(text.actionError, true);
    }
  }, options);
}
function save() {
  try {
    saveClockState(localStorage, state);
    $('save-status').textContent = text.saved;
  } catch {
    $('save-status').textContent = text.storageUnavailable;
  }
}
function commit(change) {
  const previous = structuredClone(state);
  try { change(); state = validateClockState(state); render(); save(); }
  catch (error) { state = previous; render(); throw error; }
}
function localizedCity(id) { return displayLocation(getLocation(id), locale); }
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
function render(instant = displayedWindow?.center.start ?? currentClock.now(), shift = 0) {
  visibleHours = measureVisibleHours();
  displayedWindow = clockWindow(instant, visibleHours, shift);
  slots = displayedWindow.slots;
  state.date = displayedWindow.date;
  $('date-label').textContent = referenceDate.format(displayedWindow.center.start);
  $('date-picker').value = state.date;
  $('time-format').value = state.format;
  $('reference-offset').textContent = utcOffset(displayedWindow.center.start, SEOUL_ZONE);
  $('previous-day').disabled = state.date === MIN_CLOCK_DATE;
  $('next-day').disabled = state.date === MAX_CLOCK_DATE;
  renderTimeline();
  const scroller = $('timeline-scroll');
  scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
  const now = currentClock.now();
  updateLiveTime(now);
  updateComparison(now);
}
function hourLabel(instant, place) {
  const p = zonedParts(instant, place.zone);
  const hour = state.format === '12' ? p.hour % 12 || 12 : pad(p.hour);
  return `<span class="hour-number">${hour}${p.minute ? `<span class="minute">:${pad(p.minute)}</span>` : ''}</span>${state.format === '12' ? `<span class="period">${p.hour < 12 ? text.morning : text.afternoon}</span>` : ''}`;
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
  timeline.innerHTML = `<div class="axis-row"><div class="axis-label">${escape(text.cityLocalTime)}</div><div class="axis-hours">${before}${slots.map((slot, index) => {
    const p = zonedParts(slot.start, SEOUL_ZONE);
    const hour = state.format === '12' ? p.hour % 12 || 12 : pad(p.hour);
    return `<span data-axis-cell="${index}">${hour}</span>`;
  }).join('')}${after}</div></div>` + state.locations.map((id, rowIndex) => {
    const place = localizedCity(id);
    const fixed = place.id === 'seoul';
    const name = escape(place.name);
    const controls = fixed ? '' : `<div class="row-controls">
      <button type="button" data-action="up" aria-label="${escape(text.moveUp(place.name))}"${rowIndex === 1 ? ' disabled' : ''}>↑</button>
      <button type="button" data-action="down" aria-label="${escape(text.moveDown(place.name))}"${rowIndex === state.locations.length - 1 ? ' disabled' : ''}>↓</button>
      <button type="button" class="remove-city" data-action="remove" title="${escape(text.removeCity(place.name))}" aria-label="${escape(text.removeCity(place.name))}">×</button>
    </div>`;
    return `<div class="city-row${fixed ? ' seoul-row' : ''}" data-id="${escape(place.id)}">
      <div class="city-info">
        <div class="city-identity"><strong class="city-name" title="${name}">${name}</strong><p class="city-zone">${escape(place.country)}<span class="zone-abbreviation"></span></p></div>
        <div class="city-reading"><time class="city-clock"></time><p class="city-date"></p></div>
        ${controls}
      </div>
      <div class="lane" data-row="${rowIndex}" aria-label="${escape(text.timelineFor(place.name))}">${before}${slots.map((slot, index) => {
      const p = zonedParts(slot.start, place.zone);
      const phase = p.hour < 7 || p.hour >= 22 ? 'night' : p.hour >= 18 ? 'evening' : 'day';
      const dateChanged = index === 0 || dateString(slot.start, place.zone) !== dateString(slots[index - 1].start, place.zone);
      const label = `${place.name} ${shortDate(slot.start, place.zone, locale)} ${formatTime(slot.start, place.zone, state.format, locale)} ${utcOffset(slot.start, place.zone)}`;
      const tabIndex = slot.start === displayedWindow.center.start ? 0 : -1;
      return `<button type="button" class="time-cell ${phase}${dateChanged && index ? ' date-boundary' : ''}" data-cell="${index}" tabindex="${tabIndex}" aria-label="${escape(label)}" aria-pressed="false" title="${escape(label)}">${dateChanged ? `<span class="day-marker">${p.month}/${p.day}</span>` : ''}${hourLabel(slot.start, place)}</button>`;
    }).join('')}${after}<div class="comparison-band" hidden></div><div class="now-line" aria-hidden="true" hidden></div></div></div>`;
  }).join('');
}
function updateLiveTime(now) {
  const clock = $('live-time');
  clock.textContent = formatTime(now, SEOUL_ZONE, state.format, locale, true);
  clock.dateTime = new Date(now).toISOString();
  const source = currentClock.source();
  if (source !== clockSource.dataset.source) {
    clockSource.dataset.source = source;
    $('clock-source-tooltip').textContent = source === 'server' ? text.clockServerSource : text.clockDeviceSource;
  }

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
function updateComparison(now = currentClock.now()) {
  const instant = hoverInstant ?? selectedInstant ?? now;
  const fixed = selectedInstant !== null;
  const comparing = hoverInstant !== null || fixed;
  // 행 교체 중 발생하는 focusout에서도 기존 DOM 행의 도시를 정확히 갱신합니다.
  document.querySelectorAll('.city-row').forEach(row => {
    const place = localizedCity(row.dataset.id);
    row.querySelector('.city-clock').textContent = formatTime(instant, place.zone, state.format, locale);
    row.querySelector('.city-date').textContent = shortDate(instant, place.zone, locale);
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
  $('comparison-status').textContent = comparing
    ? text.comparing(shortDate(instant, SEOUL_ZONE, locale), formatTime(instant, SEOUL_ZONE, state.format, locale))
    : text.comparisonHint;
}
function showWindowAt(instant, follow = false, shift = 0) {
  followingNow = follow;
  selectedInstant = null;
  hoverInstant = null;
  render(instant, shift);
}
function changeDate(date) {
  if (date === dateString(currentClock.now(), SEOUL_ZONE)) returnToNow();
  else showWindowAt(wallToInstant(date, '12:00', SEOUL_ZONE));
}
function returnToNow() { showWindowAt(currentClock.now(), true); }

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

function scrollTimeline(event) {
  if (event.ctrlKey || timelinePointer || !event.target.closest('.lane, .axis-hours')) return;
  const { deltaMode, deltaX, deltaY } = event;
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (!delta) return;
  event.preventDefault();

  const unitsPerHour = deltaMode === WheelEvent.DOM_DELTA_LINE ? wheelLinesPerHour
    : deltaMode === WheelEvent.DOM_DELTA_PAGE ? 1 : wheelPixelsPerHour;
  if (Math.sign(wheelOffset) !== Math.sign(delta)) wheelOffset = 0;
  wheelOffset += delta / unitsPerHour;
  const shift = Math.max(-visibleHours, Math.min(visibleHours, Math.trunc(wheelOffset)));
  // 트랙패드의 작은 움직임은 모아서 한 시간 칸씩 이동합니다.
  wheelOffset %= 1;
  if (shift) showWindowAt(displayedWindow.center.start, false, shift);
}

function showSearch() {
  searchItems = searchLocations($('city-search').value);
  searchIndex = -1;
  $('search-results').innerHTML = searchItems.length ? searchItems.map((result, index) => {
    const place = displayLocation(result, locale);
    const added = state.locations.includes(place.id);
    return `<button type="button" class="search-option" role="option" aria-selected="false" id="search-option-${index}" data-search-index="${index}"${added ? ' disabled' : ''}><span><strong>${escape(place.name)}</strong><small>${escape(place.country)} · ${escape(place.zone)}</small></span><span class="add-symbol" aria-hidden="true">${added ? '✓' : '+'}</span></button>`;
  }).join('') : `<p class="search-empty">${escape(text.noResults)}</p>`;
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
  if (state.locations.length >= MAX_CITIES) {
    notify(text.cityLimit(MAX_CITIES), true);
    return;
  }
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
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.search-wrap')) closeSearch();
  if (!clockSource.contains(event.target)) setClockTooltip(false);
});
on('previous-day', 'click', () => changeDate(addDays(state.date, -1)));
on('next-day', 'click', () => changeDate(addDays(state.date, 1)));
on('current-time', 'click', returnToNow);
on('date-picker', 'change', event => {
  const date = event.target.value;
  try { parseDate(date); }
  catch {
    event.target.value = state.date;
    notify(text.invalidDate, true);
    return;
  }
  changeDate(date);
});
on('time-format', 'change', event => commit(() => { state.format = event.target.value; }));
on('timeline', 'wheel', scrollTimeline, { passive: false });
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
function setClockTooltip(visible) {
  clockSourceIcon.setAttribute('aria-expanded', String(visible));
}

clockSourceIcon.addEventListener('click', () => setClockTooltip(true));
clockSource.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') setClockTooltip(true);
});
clockSource.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse' && !clockSourceIcon.matches(':focus-visible')) setClockTooltip(false);
});
clockSourceIcon.addEventListener('focus', () => {
  if (clockSourceIcon.matches(':focus-visible')) setClockTooltip(true);
});
clockSourceIcon.addEventListener('blur', event => {
  if (event.relatedTarget) setClockTooltip(false);
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('city-search').focus(); }
  if (event.key !== 'Escape') return;
  if (clockSourceIcon.getAttribute('aria-expanded') === 'true') {
    setClockTooltip(false);
    return;
  }
  closeSearch(); selectedInstant = null; hoverInstant = null; updateComparison();
});
function tick() {
  if (document.hidden) return;
  const now = currentClock.now();
  const { start, end } = displayedWindow.center;
  if (followingNow && !timelinePointer && selectedInstant === null && hoverInstant === null && (now < start || now >= end)) {
    render(now);
    return;
  }
  updateLiveTime(now);
  updateComparison(now);
}
async function refreshClock() {
  if (document.hidden) return;
  await currentClock.sync();
  tick();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tick();
  refreshClock();
});
window.addEventListener('offline', () => {
  currentClock.useDeviceTime();
  tick();
});
window.addEventListener('online', refreshClock);
window.addEventListener('pageshow', event => { if (event.persisted) refreshClock(); });
const clock = setInterval(tick, 1000);
const clockSync = setInterval(refreshClock, syncInterval);
render();
refreshClock();
const timelineResize = new ResizeObserver(() => { if (measureVisibleHours() !== visibleHours) render(); });
timelineResize.observe($('timeline-scroll'));
window.addEventListener('pagehide', event => {
  currentClock.useDeviceTime();
  if (event.persisted) return;
  clearInterval(clock);
  clearInterval(clockSync);
  timelineResize.disconnect();
});
if (startupNotice) { $('save-status').textContent = startupNotice; notify(startupNotice, true); }
