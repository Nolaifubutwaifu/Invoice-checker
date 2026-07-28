# invoice-checker

Watches a folder for Brisbins invoice PDFs, picks out the **bins and lids** sold,
and keeps a spreadsheet up to date. Spare parts, freight and pickup notes are
ignored.

## Setup

```bash
npm install
```

Requires Node.js (tested on v24).

## Use

```bash
npm run scan
```

Scans once and updates the spreadsheet. Only new or changed PDFs are read, so
running it repeatedly is cheap.

```bash
npm run watch
```

Scans immediately, then every 10 minutes. Leave it running; `Ctrl+C` stops it.

```bash
npm run rebuild
```

Forgets what it has seen and re-reads every PDF from scratch. Use this after
changing the parser or the colour list.

```bash
npm run show
```

Prints the spreadsheet to the terminal, without opening Excel.

## Configuration

`config.json`:

| Key | Meaning |
| --- | --- |
| `invoiceFolder` | Folder to scan. Searched recursively. |
| `outputFile` | Where the `.xlsx` is written. |
| `intervalMinutes` | How often `watch` re-scans. Default 10. |
| `recursive` | Set `false` to scan only the top-level folder. |
| `ignoreFolders` | Subfolder names to skip. |

## What the spreadsheet contains

**Sales log** — **one row per item**, because bins and lids are stocked
separately. An invoice line for 5 complete bins produces two rows: 5 bins and 5
lids. Columns: invoice number, date, customer, product, size, item (Bin/Lid),
colour, variant, quantity, unit price, source file, and the raw description it
came from.

Unit price is the price of the invoice line it came from, so on a bin sold with
a matching lid it is the price of the pair, shown against the bin. The lid row
is left blank rather than guessing at a split. The raw description column always
shows what was actually invoiced.

**Totals** — quantity per unique product, most-sold first, with a grand total
row. This is a count of what went out the door, not a revenue report.

**Needs review** — line items that were read but not with full confidence, with
the reason (no size found, no colour found, more colours than expected). Nothing
is ever silently dropped or silently guessed; check this sheet occasionally.

## How descriptions are read

Product names are rebuilt with the size first, as Brisbins writes them, then the
variant, then bin or lid, then the colour.

| Invoice description | Rows produced |
| --- | --- |
| `240L bin purple complete` | `240L Bin Purple` + `240L Lid Purple` |
| `240L Wheelie Bin Dark Green/Light Blue Lid` | `240L Bin Dark Green` + `240L Lid Light Blue` |
| `Red 240L Vermin lid` | `240L Vermin Lid Red` |
| `660L Bin Green` | `660L Bin Green` |
| `1100L Lid Pins` | none — a part, despite saying "lid" |
| `80L HD Wheels`, `Freight`, `Pickup` | none |

A line counts as a sale when it names a bin or a lid and is not a spare part. An
accessory bundled onto a bin (`240L Bin Green Complete with Lock`) still counts
as a bin sale.

Colours are matched against `CATALOG_COLOURS` in `src/parse.js` — the colours
that actually exist in the product catalog — longest name first, so
`Council Green` is never read as `Green`. Alternative spellings (`gray`,
`Red AJ Bush`) are normalised to the catalog's own wording.

A colour that is recognised but is **not** in the catalog is still recorded, and
flagged on the "Needs review" sheet. That usually means a genuinely new product
— add it to `CATALOG_COLOURS` and run `npm run rebuild` — or a description that
was misread.

## Notes

- The spreadsheet is regenerated in full from `data/ledger.json` on every scan,
  so re-issued invoices correct themselves and an improved parser can be applied
  retroactively with `npm run rebuild`.
- If the workbook is open in Excel when a scan runs, the data is written to a
  timestamped copy alongside it rather than being lost.
- If a PDF is deleted from the folder, its rows drop out on the next scan.
- Invoice PDFs, the generated spreadsheet and `data/` are gitignored: they
  contain customer names, addresses, phone numbers and bank details.

## Running it automatically

`npm run watch` only runs while the terminal is open. To have it scan in the
background and survive a reboot, register a Windows scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
```

This creates a task that runs `npm run scan` every 10 minutes at logon. Remove
it with:

```powershell
Unregister-ScheduledTask -TaskName "Brisbins Invoice Checker" -Confirm:$false
```

## Planned work

[INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) covers feeding this project and the
inventory-app into one database, so sold stock can be reconciled against counted
stock. Nothing is built yet.

Phase 1 of that plan will have this project read the colour list from the
catalog directly. Until then `CATALOG_COLOURS` in `src/parse.js` is a copy of
it, and the two can drift.

## Tests

```bash
npm test
```

Covers the description shapes above, the parts that must be skipped, and the
cases that should be flagged for review.
