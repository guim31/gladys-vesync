// -----------------------------------------------------------------------------
// The VeSync session kept between restarts.
//
// One JSON file in the container's only writable volume: the installation's
// terminal id, and the token of the configured account with its region and
// country (keyed by a SHA-256 of the e-mail, so another account never reuses
// it). Readable by the container user only. The password is never written:
// it stays in the Gladys configuration.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DATA_DIR = process.env.GLADYS_DATA_DIR || '/data';
const FILE_NAME = 'vesync-session.json';

/**
 * @param {string} [dir] the directory of the file (default /data)
 * @returns {{ load(): Promise<object|null>, save(data: object): Promise<void> }}
 */
export function createSessionStore(dir = DATA_DIR) {
  const path = join(dir, FILE_NAME);
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        // No file yet, or an unreadable one: start over with a fresh login.
        return null;
      }
    },

    async save(data) {
      await mkdir(dir, { recursive: true });
      // Write then rename: a crash mid-write never leaves half a file.
      const temporary = `${path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(data)}\n`, { mode: 0o600 });
      await rename(temporary, path);
    },
  };
}

/** A store in memory (tests, the probe script). */
export function createMemoryStore(initial = null) {
  let data = initial;
  return {
    async load() {
      return data === null ? null : structuredClone(data);
    },
    async save(next) {
      data = structuredClone(next);
    },
    get data() {
      return data;
    },
  };
}
