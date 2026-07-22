// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Minimal ZIP reader — enough to read an .xlsx (which is a ZIP of XML parts).
//
// Deliberately dependency-free. Adding a package here would mean the data
// pipeline needs `npm install` on CI, which is a whole class of failure we do
// not need for "read some XML out of a zip". Node's zlib does the hard part.
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;

/**
 * Read a ZIP buffer into a Map of filename -> Buffer.
 * Only stored (0) and deflate (8) entries are supported; xlsx uses both.
 */
export function unzip(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== CDIR_SIG) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    // The local header repeats the name/extra with its OWN lengths — the extra
    // field commonly differs in size from the central directory copy, so the
    // data offset must be computed from the local header, not the central one.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function findEOCD(buf) {
  // The EOCD sits at the very end unless there is a zip comment; scan back over
  // the maximum comment length (64 KB) rather than assuming a fixed position.
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}
