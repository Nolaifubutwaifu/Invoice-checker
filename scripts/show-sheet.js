/**
 * Prints the generated workbook to the terminal, for a quick look without
 * opening Excel.
 *
 *   npm run show
 */
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(ROOT, process.argv[2] ?? 'bin-and-lid-sales.xlsx');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(target);

for (const sheet of workbook.worksheets) {
  console.log(`\n--- ${sheet.name} (${Math.max(sheet.rowCount - 1, 0)} data rows) ---`);
  sheet.eachRow((row, i) => {
    const cells = row.values.slice(1).map((v) => {
      if (v instanceof Date) return v.toLocaleDateString('en-AU');
      return v === null || v === undefined ? '' : String(v);
    });
    console.log(`${String(i).padStart(3)} | ${cells.join(' | ')}`);
  });
}
