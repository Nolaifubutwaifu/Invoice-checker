/**
 * Persistent record of everything scanned so far.
 *
 * The spreadsheet is always regenerated from this ledger rather than appended
 * to, which keeps things correct if a PDF is re-issued, if the workbook is open
 * in Excel during a scan, or if the parser is improved and everything needs
 * re-reading.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const EMPTY = { files: {}, records: [] };

export async function loadLedger(ledgerPath) {
  try {
    const raw = await readFile(ledgerPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { files: parsed.files ?? {}, records: parsed.records ?? [] };
  } catch (err) {
    if (err.code === 'ENOENT') return structuredClone(EMPTY);
    throw err;
  }
}

export async function saveLedger(ledgerPath, ledger) {
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
}

/** True when the file is new or has changed since it was last scanned. */
export function needsScan(ledger, filePath, stat) {
  const seen = ledger.files[filePath];
  if (!seen) return true;
  return seen.mtimeMs !== stat.mtimeMs || seen.size !== stat.size;
}

/** Replaces every record sourced from `filePath` with a fresh set. */
export function replaceRecords(ledger, filePath, records) {
  ledger.records = ledger.records.filter((r) => r.file !== filePath);
  ledger.records.push(...records);
}
