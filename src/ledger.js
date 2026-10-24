// -----------------------------------------------------------------------------
// What the scene triggers already saw.
//
// Kept in /data (the one writable volume) so a container restarted in the
// middle of a cheap hour compares the next price with the last one it saw,
// rather than firing "below" again, and does not announce tomorrow's prices
// twice. Losing the file is harmless (the first price after it is a
// baseline); failing to write it is logged in debug only, the ledger in
// memory carries on.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'comed:ledger' });
const FILE = 'scene-events.json';

/** @param {string} dataDir */
export function createSceneLedger(dataDir) {
  const path = join(dataDir, FILE);
  // The last 5-minute price compared: { at (ms), price, average }.
  let previous = null;
  // The last day whose day-ahead prices were announced.
  let announcedDay = null;
  // The once-an-hour events already fired in the hour `hour` (start, ms),
  // saved with the next price so a restart keeps the rule.
  let fired = { hour: null, ids: new Set() };

  async function save() {
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(
        `${path}.tmp`,
        JSON.stringify({
          previous,
          announced_day: announcedDay,
          fired: { hour: fired.hour, ids: [...fired.ids] },
        }),
      );
      await rename(`${path}.tmp`, path);
    } catch (err) {
      logger.debug(`Scene ledger not saved (${err.message})`);
    }
  }

  return {
    async load() {
      try {
        const saved = JSON.parse(await readFile(path, 'utf8'));
        const p = saved.previous;
        if (
          previous === null &&
          p &&
          Number.isFinite(p.at) &&
          Number.isFinite(p.price) &&
          (p.average === null || Number.isFinite(p.average))
        ) {
          previous = p;
        }
        const f = saved.fired;
        if (fired.hour === null && f && Number.isFinite(f.hour) && Array.isArray(f.ids)) {
          fired = { hour: f.hour, ids: new Set(f.ids.filter((id) => typeof id === 'string')) };
        }
        if (typeof saved.announced_day === 'string' && announcedDay === null) {
          announcedDay = saved.announced_day;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.debug(`Scene ledger unreadable, starting afresh (${err.message})`);
        }
      }
    },

    /** @returns {{ at: number, price: number, average: number } | null} */
    get previous() {
      return previous;
    },

    /** @param {{ at: number, price: number, average: number }} value */
    async setPrevious(value) {
      previous = value;
      await save();
    },

    /** @param {number} hour start (ms) @param {string} id */
    firedThisHour(hour, id) {
      return fired.hour === hour && fired.ids.has(id);
    },

    /** @param {number} hour start (ms) @param {string} id */
    markFired(hour, id) {
      if (fired.hour !== hour) {
        fired = { hour, ids: new Set() };
      }
      fired.ids.add(id);
    },

    /** @param {string} day `YYYY-MM-DD` */
    announced(day) {
      return announcedDay !== null && day <= announcedDay;
    },

    /** @param {string} day `YYYY-MM-DD` */
    async markAnnounced(day) {
      announcedDay = day;
      await save();
    },
  };
}
