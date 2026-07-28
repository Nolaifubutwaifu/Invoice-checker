<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

This project uses Next.js. Version-matched documentation is bundled at
`node_modules/next/dist/docs/`. Read the relevant guide there **before** writing
any Next.js code — it reflects the installed version, not training data.

<!-- END:nextjs-agent-rules -->

## This project specifically

Next **16**, which runs **Turbopack by default**. A `webpack` config in
`next.config.mjs` is not applied and raises an error at startup; configure
`turbopack` instead. The current config is deliberately empty — see the comment
in the file for why nothing is needed.

## Shared code

The website and the CLI share one parser. Keep it that way.

| Module | Runs in | Notes |
| --- | --- | --- |
| `src/parse.js` | both | description → bin/lid components |
| `src/records.js` | both | invoice → spreadsheet rows |
| `src/pdf-core.js` | both | PDF → line items. **No Node built-ins** |
| `src/sheet-core.js` | both | rows → ExcelJS workbook. **No Node built-ins** |
| `src/pdf.js` | CLI only | adds `readFile` |
| `src/sheet.js` | CLI only | adds writing to disk |
| `src/index.js`, `src/ledger.js` | CLI only | folder scanning, state |

The `-core` modules are imported by the browser. **Do not add `node:fs`,
`node:path` or any other built-in to them** — that is the whole reason the
split exists. Put anything filesystem-shaped in the wrapper alongside it.

Two traps already hit here, both worth remembering:

- Node's `readFile` returns a `Buffer`, which is a `Uint8Array` subclass but
  which pdf.js rejects by name. `pdf-core.js` takes a plain view over it.
- pdf.js needs its worker at a stable URL. `scripts/copy-pdf-worker.mjs` copies
  it into `public/` before `dev` and `build`; the copy is gitignored.

## Before pushing

```bash
npm test        # 64 tests, parser behaviour
npm run scan    # the five sample invoices still parse
npm run build   # the Vercel build
```
