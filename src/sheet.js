/**
 * Node-only wrapper around the workbook builder in `sheet-core.js`, which the
 * website shares. Adds writing to disk.
 */
import path from 'node:path';
import { buildWorkbook } from './sheet-core.js';

export { buildWorkbook };

/**
 * Writes the workbook. If the target is locked (typically open in Excel) the
 * data is written alongside it under a timestamped name instead of being lost.
 * @returns {Promise<{path: string, diverted: boolean}>}
 */
export async function writeWorkbook(outputPath, records) {
  const workbook = buildWorkbook(records);

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
