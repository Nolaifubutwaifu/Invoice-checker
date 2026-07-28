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

**Sales log** — one row per bin or lid line item: invoice number, date,
customer, product, size, type, bin colour, lid colour, variant, quantity, unit
price, amount, source file, and the raw description it came from.

**Totals** — quantity and value per unique product, most-sold first, with a
grand total row.

**Needs review** — line items that were read but not with full confidence, with
the reason (no size found, no colour found, more colours than expected). Nothing
is ever silently dropped or silently guessed; check this sheet occasionally.

## How descriptions are read

Product names are rebuilt in Brisbins' own convention — size first, `complete`
when the bin and lid match, otherwise both colours spelled out.

| Invoice description | Read as |
| --- | --- |
| `240L bin purple complete` | `240L Bin Purple Complete` — bin and lid both purple |
| `240L Wheelie Bin Dark Green/Light Blue Lid` | `240L Bin Dark Green / Light Blue Lid` |
| `Red 240L Vermin lid` | `240L Red Vermin Lid` — lid only |
| `1100L Lid Pins` | skipped — a part, despite saying "lid" |
| `80L HD Wheels`, `Freight`, `Pickup` | skipped |

A line counts as a sale when it names a bin or a lid and is not a spare part. An
accessory bundled onto a bin (`240L Bin Green Complete with Lock`) still counts
as a bin sale.

Colours are matched against a vocabulary in `src/parse.js` (`BASE_COLOURS` and
`MODIFIERS`), which handles two-word colours like `Dark Green` and normalises
`gray` to `Grey`. **If a colour is ever missed, add it to `BASE_COLOURS` and run
`npm run rebuild`** — it will show up on the "Needs review" sheet in the
meantime.

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

## Tests

```bash
npm test
```

Covers the description shapes above, the parts that must be skipped, and the
cases that should be flagged for review.
