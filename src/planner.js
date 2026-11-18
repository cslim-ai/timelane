import { MINUTE, HOUR, daySlots, isWorkingTime } from './time.js';

function allWorking(start, end, location) {
  for (let t = start; t < end; t += 5 * MINUTE) if (!isWorkingTime(t, location)) return false;
  return isWorkingTime(end - 1, location);
}
export function availabilityReport(selection, locations, events = []) {
  return {
    locations: locations.map(location => ({ ...location, working: allWorking(selection.start, selection.end, location) })),
    busy: events.filter(event => event.end > event.start && event.start < selection.end && event.end > selection.start),
  };
}
export function findCommonSlot(date, locations, events = [], duration = HOUR) {
  if (!locations.length) return null;
  const slots = daySlots(date, locations[0].zone);
  for (let start = slots[0].start; start + duration <= slots.at(-1).end; start += 15 * MINUTE) {
    const selection = { start, end: start + duration };
    const report = availabilityReport(selection, locations, events);
    if (report.locations.every(location => location.working) && !report.busy.length) return selection;
  }
  return null;
}
