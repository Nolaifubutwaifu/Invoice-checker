#!/usr/bin/env node
/**
 * invoice-checker
 *
 *   node src/index.js scan      scan once and update the spreadsheet
 *   node src/index.js watch     scan now, then every intervalMinutes
 *   node src/index.js rebuild   forget what was scanned and re-read every PDF
 */
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractInvoice } from './pdf.js';
import { recordsFromInvoice } from './records.js';
import { loadLedger, saveLedger, needsScan, replaceRecords } from './ledger.js';
import { writeWorkbook } from './sheet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = path.join(ROOT, 'data', 'ledger.json');

async function loadConfig() {
  const raw = await readFile(path.join(ROOT, 'config.json'), 'utf8');
  const cfg = JSON.parse(raw);
  return {
    invoiceFolder: path.resolve(ROOT, cfg.invoiceFolder),
    outputFile: path.resolve(ROOT, cfg.outputFile),
    intervalMinutes: cfg.intervalMinutes ?? 10,
    recursive: cfg.recursive !== false,
    ignoreFolders: new Set(cfg.ignoreFolders ?? []),
  };
}

/** Every .pdf under the folder, skipping the noisy directories. */
async function findPdfs(dir, cfg, depth = 0) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!cfg.recursive || depth >= 6) continue;
      if (cfg.ignoreFolders.has(entry.name) || entry.name.startsWith('.')) continue;
      found.push(...(await findPdfs(full, cfg, depth + 1)));
    } else if (entry.name.toLowerCase().endsWith('.pdf')) {
      found.push(full);
    }
  }
  return found;
}

/** Reads one invoice and returns a record per bin/lid line item. */
async function recordsFor(filePath) {
  return recordsFromInvoice(await extractInvoice(filePath), filePath);
}

async function scan({ force = false } = {}) {
  const cfg = await loadConfig();
  const ledger = force ? { files: {}, records: [] } : await loadLedger(LEDGER_PATH);

  const pdfs = await findPdfs(cfg.invoiceFolder, cfg);
  let scanned = 0;
  let newRecords = 0;
  const failures = [];

  for (const filePath of pdfs) {
    const st = await stat(filePath);
    if (!force && !needsScan(ledger, filePath, st)) continue;

    try {
      const records = await recordsFor(filePath);
      replaceRecords(ledger, filePath, records);
      ledger.files[filePath] = {
        mtimeMs: st.mtimeMs,
        size: st.size,
        scannedAt: new Date().toISOString(),
        items: records.length,
      };
      scanned += 1;
      newRecords += records.length;
    } catch (err) {
      failures.push(`${path.basename(filePath)}: ${err.message}`);
    }
  }

  // Drop records whose source PDF has been removed from the folder.
  const present = new Set(pdfs);
  for (const known of Object.keys(ledger.files)) {
    if (!present.has(known)) {
      delete ledger.files[known];
      ledger.records = ledger.records.filter((r) => r.file !== known);
    }
  }

  await saveLedger(LEDGER_PATH, ledger);

  const stamp = new Date().toLocaleTimeString('en-AU', { hour12: false });
  if (scanned === 0 && !force) {
    console.log(`[${stamp}] no new invoices (${pdfs.length} PDF(s) already scanned)`);
  } else {
    const out = await writeWorkbook(cfg.outputFile, ledger.records);
    const flagged = ledger.records.filter((r) => r.review?.length).length;
    console.log(
      `[${stamp}] scanned ${scanned} invoice(s), found ${newRecords} bin/lid line(s). ` +
        `Ledger now holds ${ledger.records.length} line(s)` +
        (flagged ? `, ${flagged} need review` : '') +
        `.`,
    );
    console.log(`          spreadsheet: ${out.path}`);
    if (out.diverted) {
      console.log('          (target was locked, probably open in Excel — wrote a copy instead)');
    }
  }

  for (const f of failures) console.error(`          could not read ${f}`);
  return { scanned, newRecords };
}

async function main() {
  const command = process.argv[2] ?? 'scan';

  if (command === 'scan') {
    await scan();
    return;
  }

  if (command === 'rebuild') {
    await scan({ force: true });
    return;
  }

  if (command === 'watch') {
    const cfg = await loadConfig();
    const ms = cfg.intervalMinutes * 60 * 1000;
    console.log(`Watching ${cfg.invoiceFolder} every ${cfg.intervalMinutes} minute(s).`);
    console.log('Press Ctrl+C to stop.\n');

    const tick = () => scan().catch((err) => console.error('scan failed:', err.message));
    await tick();
    setInterval(tick, ms);
    return;
  }

  console.error(`Unknown command "${command}". Use: scan | watch | rebuild`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
