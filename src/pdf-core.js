/**
 * Pulls the line-item table out of a Brisbins invoice PDF.
 *
 * The invoices are a fixed template, so rather than guess at column positions
 * we read them off the table header on each page and bucket every text run into
 * the nearest column.
 *
 * This module touches no filesystem, so it runs unchanged in the browser as
 * well as in the CLI. `src/pdf.js` wraps it for reading files from disk.
 * `pdfjs` is re-exported so a browser caller can point `GlobalWorkerOptions`
 * at a worker on the very same module instance.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export { pdfjs };

const { getDocument } = pdfjs;

const COLUMNS = ['itemId', 'description', 'uom', 'qty', 'unitPrice', 'tax', 'amount'];

const HEADER_LABELS = new Map([
  ['Item ID', 'itemId'],
  ['Description', 'description'],
  ['UoM', 'uom'],
  ['Qty', 'qty'],
  ['Unit price', 'unitPrice'],
  ['Tax', 'tax'],
  ['Amount ($)', 'amount'],
]);

const Y_TOLERANCE = 3;

/** Groups text runs sharing a baseline into rows, top of page first. */
function groupIntoRows(items) {
  const runs = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

  const rows = [];
  for (const run of runs) {
    const row = rows.find((r) => Math.abs(r.y - run.y) <= Y_TOLERANCE);
    if (row) {
      row.runs.push(run);
      continue;
    }
    rows.push({ y: run.y, runs: [run] });
  }

  for (const row of rows) row.runs.sort((a, b) => a.x - b.x);
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

/**
 * Locates the table header and derives an x boundary between each column.
 * @returns {null | {y: number, bounds: {key: string, x: number}[]}}
 */
function findHeader(rows) {
  const anchorRow = rows.find(
    (r) =>
      r.runs.some((run) => run.text === 'Item ID') &&
      r.runs.some((run) => run.text === 'Description'),
  );
  if (!anchorRow) return null;

  // The header wraps over a couple of baselines ("Unit price" sits slightly
  // above "excluding tax"), so gather labels from a band around the anchor.
  const anchors = new Map();
  for (const row of rows) {
    if (Math.abs(row.y - anchorRow.y) > 18) continue;
    for (const run of row.runs) {
      const key = HEADER_LABELS.get(run.text);
      if (key && !anchors.has(key)) anchors.set(key, run.x);
    }
  }
  if (!anchors.has('itemId') || !anchors.has('description')) return null;

  const present = COLUMNS.filter((c) => anchors.has(c)).map((key) => ({
    key,
    x: anchors.get(key),
  }));

  return { y: anchorRow.y, anchors: present };
}

/** Assigns an x position to a column using midpoints between header anchors. */
function columnFor(x, anchors) {
  let pick = anchors[0].key;
  for (let i = 0; i < anchors.length; i += 1) {
    const next = anchors[i + 1];
    if (!next) return anchors[i].key;
    const boundary = (anchors[i].x + next.x) / 2;
    if (x < boundary) return anchors[i].key;
    pick = next.key;
  }
  return pick;
}

const NUMBER_RE = /^-?[\d,]+(?:\.\d+)?$/;

const toNumber = (s) => {
  if (!s) return null;
  const cleaned = s.replace(/[$,]/g, '').trim();
  return NUMBER_RE.test(cleaned.replace(/,/g, '')) ? Number(cleaned) : null;
};

/** Pulls invoice-level fields (number, date, customer) from a page's rows. */
function readInvoiceMeta(rows) {
  const meta = { invoiceNumber: '', issueDate: '', customer: '' };

  const labelRow = rows.findIndex((r) =>
    r.runs.some((run) => run.text === 'Invoice number'),
  );
  if (labelRow !== -1) {
    const labels = rows[labelRow].runs;
    const values = rows[labelRow + 1]?.runs ?? [];
    const numX = labels.find((r) => r.text === 'Invoice number')?.x;
    const dateX = labels.find((r) => r.text === 'Issue date')?.x;
    // Values sit under their label; match by nearest x.
    const nearest = (x) =>
      x == null || !values.length
        ? ''
        : values.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).text;
    meta.invoiceNumber = nearest(numX);
    const date = nearest(dateX);
    if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(date)) meta.issueDate = date;
  }

  // "Bill to" labels the block; the customer name is the first line above it.
  const billTo = rows.find((r) => r.runs.some((run) => run.text === 'Bill to'));
  if (billTo) {
    const below = rows
      .filter((r) => r.y < billTo.y && r.runs[0]?.x < 200)
      .sort((a, b) => b.y - a.y);
    meta.customer = below[0]?.runs.map((r) => r.text).join(' ') ?? '';
  }

  return meta;
}

/**
 * @param {Uint8Array|ArrayBuffer} bytes raw PDF content
 * @returns {{invoiceNumber: string, issueDate: string, customer: string,
 *            lines: {itemId: string, description: string, qty: number|null,
 *                    unitPrice: number|null, amount: number|null}[]}}
 */
export async function extractInvoiceFromData(bytes) {
  // pdfjs rejects a Node Buffer by name, even though it is a Uint8Array
  // subclass, so take a plain view over the same memory rather than passing
  // the original through.
  const data =
    bytes instanceof Uint8Array
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new Uint8Array(bytes);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  let meta = { invoiceNumber: '', issueDate: '', customer: '' };
  const lines = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = groupIntoRows(items);

    if (p === 1) meta = readInvoiceMeta(rows);

    const header = findHeader(rows);
    if (!header) continue;

    for (const row of rows) {
      if (row.y >= header.y - 5) continue;

      const flat = row.runs.map((r) => r.text).join(' ');
      // Totals block marks the end of the line items.
      if (/^(Subtotal|Total|Balance due|Tax)\b/i.test(flat)) break;

      const cells = Object.fromEntries(COLUMNS.map((c) => [c, []]));
      for (const run of row.runs) cells[columnFor(run.x, header.anchors)].push(run.text);

      const joined = Object.fromEntries(
        COLUMNS.map((c) => [c, cells[c].join(' ').trim()]),
      );

      const qty = toNumber(joined.qty);
      const amount = toNumber(joined.amount);
      const unitPrice = toNumber(joined.unitPrice);

      // A row with no item id and no figures is a wrapped description or an
      // address block belonging to the row above it.
      const isContinuation =
        !joined.itemId && qty === null && amount === null && unitPrice === null;

      if (isContinuation) {
        if (lines.length && joined.description) {
          lines[lines.length - 1].description += ` ${joined.description}`;
        }
        continue;
      }

      if (!joined.description && !joined.itemId) continue;

      lines.push({
        itemId: joined.itemId,
        description: joined.description,
        qty,
        unitPrice,
        amount,
      });
    }
  }

  await doc.destroy();
  return { ...meta, lines };
}
