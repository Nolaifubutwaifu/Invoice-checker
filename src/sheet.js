/**
 * Renders the ledger to an .xlsx workbook with three sheets:
 *   Sales log   - one row per bin/lid line item
 *   Totals      - quantity and value per unique product
 *   Needs review- anything the parser was not confident about
 */
import ExcelJS from 'exceljs';
import path from 'node:path';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E2C' } };

/** dd/mm/yyyy -> Date, so Excel can sort and filter on it properly. */
function toDate(ddmmyyyy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddmmyyyy ?? '');
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle' };
  row.height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (sheet.rowCount > 1 || sheet.columns.length) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(sheet.rowCount, 1), column: sheet.columns.length },
    };
  }
}

function buildSalesLog(workbook, records) {
  const sheet = workbook.addWorksheet('Sales log');
  sheet.columns = [
    { header: 'Invoice', key: 'invoiceNumber', width: 12 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Product', key: 'product', width: 40 },
    { header: 'Size', key: 'size', width: 8 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Bin colour', key: 'binColour', width: 14 },
    { header: 'Lid colour', key: 'lidColour', width: 14 },
    { header: 'Variant', key: 'variant', width: 12 },
    { header: 'Qty', key: 'qty', width: 7 },
    { header: 'Unit price', key: 'unitPrice', width: 11 },
    { header: 'Amount', key: 'amount', width: 11 },
    { header: 'Source file', key: 'sourceFile', width: 26 },
    { header: 'Raw description', key: 'description', width: 42 },
  ];

  const sorted = [...records].sort((a, b) => {
    const d = (toDate(a.issueDate)?.getTime() ?? 0) - (toDate(b.issueDate)?.getTime() ?? 0);
    return d !== 0 ? d : String(a.invoiceNumber).localeCompare(String(b.invoiceNumber));
  });

  for (const r of sorted) {
    sheet.addRow({
      invoiceNumber: r.invoiceNumber,
      date: toDate(r.issueDate) ?? r.issueDate,
      customer: r.customer,
      product: r.product,
      size: r.size,
      type: TYPE_LABELS[r.kind] ?? r.kind,
      binColour: r.binColour,
      lidColour: r.lidColour,
      variant: r.variant,
      qty: r.qty,
      unitPrice: r.unitPrice,
      amount: r.amount,
      sourceFile: path.basename(r.file),
      description: r.description,
    });
  }

  sheet.getColumn('date').numFmt = 'dd/mm/yyyy';
  sheet.getColumn('unitPrice').numFmt = '#,##0.00';
  sheet.getColumn('amount').numFmt = '#,##0.00';
  styleHeader(sheet);
  return sheet;
}

const TYPE_LABELS = {
  complete: 'Bin + lid (complete)',
  'bin+lid': 'Bin + lid',
  bin: 'Bin only',
  lid: 'Lid only',
};

function buildTotals(workbook, records) {
  const sheet = workbook.addWorksheet('Totals');
  sheet.columns = [
    { header: 'Product', key: 'product', width: 40 },
    { header: 'Size', key: 'size', width: 8 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Bin colour', key: 'binColour', width: 14 },
    { header: 'Lid colour', key: 'lidColour', width: 14 },
    { header: 'Qty sold', key: 'qty', width: 10 },
    { header: 'Total value', key: 'amount', width: 13 },
    { header: 'Invoices', key: 'invoices', width: 10 },
  ];

  const groups = new Map();
  for (const r of records) {
    const key = r.product;
    if (!groups.has(key)) {
      groups.set(key, {
        product: r.product,
        size: r.size,
        type: TYPE_LABELS[r.kind] ?? r.kind,
        binColour: r.binColour,
        lidColour: r.lidColour,
        qty: 0,
        amount: 0,
        invoices: new Set(),
      });
    }
    const g = groups.get(key);
    g.qty += r.qty ?? 0;
    g.amount += r.amount ?? 0;
    g.invoices.add(r.invoiceNumber);
  }

  const rows = [...groups.values()].sort(
    (a, b) => b.qty - a.qty || a.product.localeCompare(b.product),
  );

  for (const g of rows) sheet.addRow({ ...g, invoices: g.invoices.size });

  if (rows.length) {
    const total = sheet.addRow({
      product: 'TOTAL',
      qty: rows.reduce((s, g) => s + g.qty, 0),
      amount: rows.reduce((s, g) => s + g.amount, 0),
    });
    total.font = { bold: true };
    total.border = { top: { style: 'thin' } };
  }

  sheet.getColumn('amount').numFmt = '#,##0.00';
  styleHeader(sheet);
  return sheet;
}

function buildReview(workbook, records) {
  const sheet = workbook.addWorksheet('Needs review');
  sheet.columns = [
    { header: 'Invoice', key: 'invoiceNumber', width: 12 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Raw description', key: 'description', width: 46 },
    { header: 'Parsed as', key: 'product', width: 34 },
    { header: 'Qty', key: 'qty', width: 7 },
    { header: 'Why flagged', key: 'reason', width: 48 },
    { header: 'Source file', key: 'sourceFile', width: 26 },
  ];

  for (const r of records.filter((x) => x.review?.length)) {
    sheet.addRow({
      invoiceNumber: r.invoiceNumber,
      date: toDate(r.issueDate) ?? r.issueDate,
      description: r.description,
      product: r.product,
      qty: r.qty,
      reason: r.review.join('; '),
      sourceFile: path.basename(r.file),
    });
  }

  sheet.getColumn('date').numFmt = 'dd/mm/yyyy';
  styleHeader(sheet);
  return sheet;
}

/**
 * Writes the workbook. If the target is locked (typically open in Excel) the
 * data is written alongside it under a timestamped name instead of being lost.
 * @returns {Promise<{path: string, diverted: boolean}>}
 */
export async function writeWorkbook(outputPath, records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'invoice-checker';
  workbook.created = new Date();

  buildSalesLog(workbook, records);
  buildTotals(workbook, records);
  buildReview(workbook, records);

  try {
    await workbook.xlsx.writeFile(outputPath);
    return { path: outputPath, diverted: false };
  } catch (err) {
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw err;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const alt = path.join(
      path.dirname(outputPath),
      `${path.basename(outputPath, '.xlsx')}-${stamp}.xlsx`,
    );
    await workbook.xlsx.writeFile(alt);
    return { path: alt, diverted: true };
  }
}
