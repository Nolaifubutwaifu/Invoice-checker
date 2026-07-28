/**
 * Node-only wrapper around the PDF reader: reads a file from disk and hands
 * the bytes to the shared core in `pdf-core.js`, which the website uses too.
 */
import { readFile } from 'node:fs/promises';
import { extractInvoiceFromData } from './pdf-core.js';

export { extractInvoiceFromData };

/**
 * @returns {{invoiceNumber: string, issueDate: string, customer: string,
 *            lines: {itemId: string, description: string, qty: number|null,
 *                    unitPrice: number|null, amount: number|null}[]}}
 */
export async function extractInvoice(filePath) {
  return extractInvoiceFromData(await readFile(filePath));
}
