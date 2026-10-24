// -----------------------------------------------------------------------------
// The clock of ComEd: America/Chicago, whatever the timezone of the Gladys
// host. ComEd prices Northern Illinois: "today", the hours shown to the user
// and the dates the day-ahead API takes are Chicago ones.
//
// Chicago is a whole number of hours from UTC (CST -6, CDT -5), so a local
// hour is always a UTC hour: hours are cut on UTC hour boundaries.
// -----------------------------------------------------------------------------

export const COMED_TIMEZONE = 'America/Chicago';

const HOUR = 60 * 60 * 1000;
const formatters = new Map();

/**
 * @param {Date} date
 * @param {string} timeZone
 * @returns {{ year: string, month: string, day: string, hour: string, minute: string }}
 */
function parts(date, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  const found = {};
  for (const { type, value } of formatter.formatToParts(date)) {
    found[type] = value;
  }
  return found;
}

/**
 * The Chicago calendar day of an instant, `YYYY-MM-DD`.
 * @param {Date} date
 */
export function chicagoDay(date) {
  const { year, month, day } = parts(date, COMED_TIMEZONE);
  return `${year}-${month}-${day}`;
}

/**
 * The day after `day` (pure calendar arithmetic: no DST pitfall).
 * @param {string} day `YYYY-MM-DD`
 * @param {number} [offset] days to add, 1 by default
 */
export function addDays(day, offset = 1) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

/**
 * The Chicago clock time of an instant, `HH:MM`.
 * @param {Date} date
 */
export function chicagoTime(date) {
  const { hour, minute } = parts(date, COMED_TIMEZONE);
  return `${hour}:${minute}`;
}

/**
 * The Chicago hour of the clock, 0 to 23.
 * @param {Date} date
 */
export function chicagoHour(date) {
  return Number(parts(date, COMED_TIMEZONE).hour);
}

/**
 * The instant a Chicago wall-clock hour begins. An hour that does not exist
 * (02:00 the day the clocks go forward) gives null; an hour that happens
 * twice (01:00 the day they go back) gives the first one.
 * @param {number} year
 * @param {number} month 1 to 12
 * @param {number} day
 * @param {number} hour 0 to 23
 * @returns {Date | null}
 */
export function chicagoHourStart(year, month, day, hour) {
  const wall = Date.UTC(year, month - 1, day, hour);
  // CDT (UTC-5) first: on the ambiguous hour it is the earlier instant.
  for (const offset of [5, 6]) {
    const candidate = new Date(wall + offset * HOUR);
    const local = parts(candidate, COMED_TIMEZONE);
    if (
      Number(local.year) === year &&
      Number(local.month) === month &&
      Number(local.day) === day &&
      Number(local.hour) === hour
    ) {
      return candidate;
    }
  }
  return null;
}
