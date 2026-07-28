/**
 * Turns an extracted invoice into the flat records the spreadsheet is built
 * from — one per bin or lid, because the two are stocked separately.
 *
 * Shared by the CLI and the website so the two can never disagree about what
 * an invoice contains.
 */
import { parseLineItem } from './parse.js';

/**
 * @param {{invoiceNumber: string, issueDate: string, customer: string, lines: object[]}} invoice
 * @param {string} sourceName file name (or path) the invoice was read from
 */
export function recordsFromInvoice(invoice, sourceName) {
  const records = [];

  invoice.lines.forEach((line, i) => {
    const parsed = parseLineItem(line.description);
    if (!parsed) return;

    const { components, ...common } = parsed;
    components.forEach((c, j) => {
      records.push({
        id: `${sourceName.split(/[\\/]/).pop()}#${i}.${j}`,
        file: sourceName,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        customer: invoice.customer,
        itemId: line.itemId,
        description: line.description,
        qty: line.qty ?? 1,
        // Only the priced component carries the money; the other came bundled
        // with it on the same invoice line.
        unitPrice: c.priced ? line.unitPrice : null,
        component: c.component,
        colour: c.colour,
        product: c.product,
        ...common,
      });
    });
  });

  return records;
}
