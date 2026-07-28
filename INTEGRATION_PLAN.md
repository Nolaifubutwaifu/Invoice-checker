# Feeding invoice-checker and inventory-app into one database

Status: **planned, nothing built.** Written 28 July 2026.

This document is a handoff. It assumes no prior context — everything needed to
pick the work up cold is here.

## The idea in one line

invoice-checker records **stock going out** (bins and lids sold, read from
invoice PDFs); inventory-app records **stock counted** on the warehouse floor.
Joining them gives the "Expected vs. counted" variance report already listed as
a v2 feature in the inventory-app spec (`PROJECT_SPEC.md` §11.3).

## The two projects

| | invoice-checker | inventory-app |
| --- | --- | --- |
| GitHub | `Nolaifubutwaifu/Invoice-checker` (capital I) | `Nolaifubutwaifu/inventory-app` |
| Local | `C:\Users\Sales\Desktop\ai-projects\invoice-checker` | `C:\Users\Sales\Desktop\ai-projects\inventory-app` |
| Stack | Node CLI, pdfjs-dist + exceljs | Next.js + React + Tailwind, Capacitor iOS, Vercel |
| Storage | `data/ledger.json`, xlsx output | Dexie/IndexedDB local-first, Supabase mirror |

> Before writing any code in inventory-app, read its `AGENTS.md`: it uses a
> Next.js version with breaking changes from what you may expect, and tells you
> to read `node_modules/next/dist/docs/` first.

## What the Supabase database actually is

Do not assume a relational schema. There is **one table**.

- Project name `inventory-app`, ref **`nquytnfqwjurrtgseuof`**, region
  ap-southeast-1, status ACTIVE_HEALTHY. (Three other projects on the account —
  `Couple App`, `pdf-reader`, `labyrinth` — are unrelated and inactive.)
- Single table `public.sync_records`, primary key `(collection, id)`:

  ```
  collection  text     -- 'items' | 'sessions' | 'entries' | 'location_templates'
  id          text
  account_id  text     -- 'dev-shared-account' while DEV_AUTH_BYPASS is on
  data        jsonb    -- the whole entity
  deleted     boolean
  updated_at  bigint
  ```

- It is a generic mirror of the app's local Dexie tables, pushed by
  `lib/sync/engine.ts` and pulled back over Supabase realtime. It is **not** a
  normalised schema and was never intended as one.

Row counts as of writing (live / total including tombstones):

| collection | live | total |
| --- | --- | --- |
| items | 348 | 400 |
| entries | 1 | 14 |
| sessions | 2 | 6 |
| location_templates | 4 | 4 |

### The `items` shape

From `inventory-app/lib/types.ts`:

```ts
interface Item {
  id: ID; userId: ID; name: string; sku: string; category: string;
  color: string; size: string; photoUrl?: string; referencePhotos?: string[];
  barcode?: string; notes?: string; createdAt: number; updatedAt: number;
}
```

Categories in use: `Bin` (153), `Lid` (153), `Pedal Bin` (18),
`Pedal Bin Lid` (18), `Vermin Lid` (6).

Sizes in use: 80L, 100L, 120L, 160L, 240L, 360L, 500L, 660L, 1100L.

The 19 colours in use — **this list is the source of truth, not a guess**:

```
Black, Council Green, Dark Green, Dark Grey, Grass Green, Light Blue,
Light Grey, Lime Green, Mud Green, Orange, Purple, Red, Red (AJ Bush),
Royal Blue, Sky Blue, Ugly Purple, Ugly Red, White, Yellow
```

## The good news: the naming conventions already match

| inventory-app catalog | invoice-checker output |
| --- | --- |
| name `100L Bin Dark Green`, sku `100L-BIN-DARK-GREEN` | `240L Bin Dark Green` |
| name `100L Lid Light Blue`, sku `100L-LID-LIGHT-BLUE` | `240L Lid Light Blue` |

Both use `{size} {Bin|Lid} {Colour}`. The SKU is derivable:
`{SIZE}-{CATEGORY}-{COLOUR}`, uppercased, spaces to hyphens, parentheses
dropped (`Red (AJ Bush)` → `RED-AJ-BUSH`).

Field mapping:

| invoice-checker | inventory-app `Item` |
| --- | --- |
| `size` (`240L`) | `size` |
| `component` (`Bin` / `Lid`) + `variant` | `category` (`Bin`, `Lid`, `Vermin Lid`, `Pedal Bin`, `Pedal Bin Lid`) |
| `colour` | `color` |
| `product` | `name` |

So no fuzzy-matching layer is needed for the common case. That is normally the
expensive part of this kind of integration and it is already done.

## Blocker 1 — the colour vocabulary is wrong, and fails silently

`src/parse.js` matches colours against a hardcoded `BASE_COLOURS` +
`MODIFIERS` list. Tested against the 19 real catalog colours, **13 of 19 pass**:

| catalog colour | parsed as |
| --- | --- |
| Council Green | Green |
| Grass Green | Green |
| Mud Green | Green |
| Ugly Purple | Purple |
| Ugly Red | Red |
| Red (AJ Bush) | Red |

These fail **silently**: a colour *was* found, so the "no colour found" review
flag never fires. A real sale of a Council Green bin is logged as
`240L Bin Green` — a product that does not exist — and nothing surfaces it.

This is a live bug in invoice-checker today, independent of the integration.

**The fix is the integration.** Drop the hardcoded colour list; resolve
descriptions against the catalog instead, longest-match-wins, and send anything
unmatched to the Needs review sheet. The catalog becomes the single source of
truth for what colours exist and drift becomes impossible.

To reproduce the check, write a throwaway script that runs `parseLineItem` over
`240L bin ${colour} complete` for each of the 19 colours above and compares
`components[0].colour` to the input.

## Blocker 2 — customer PII must not go into this database

`inventory-app/SUPABASE_SETUP.md` states it plainly: the RLS policy is
`for all to anon using (true) with check (true)`, so anyone with the site URL
can read and write everything. It is labelled a testing-only setup.

invoice-checker records currently carry `customer` (name) and the source PDFs
carry addresses, phone numbers, emails and Brisbins bank details.

**Recommendation: never store customer identity in Supabase.** Reconciliation
needs only SKU, quantity, date and invoice number. Keep names in the local
`data/ledger.json` and the xlsx. This sidesteps the RLS problem instead of
depending on getting auth right first — and should hold even after real auth
lands, since the app has no use for customer names.

## Recommended design

Add **proper relational tables** (`invoices`, `invoice_lines`) to the same
Postgres project, alongside `sync_records`. Do *not* add new sync collections.

Rationale: sales data is server-authoritative, arrives in batches, and is never
edited on a phone. Pushing it through a device-sync mirror would conflate two
unrelated data lifecycles and force it into jsonb blobs that cannot be joined or
constrained. A separate relational island in the same database keeps `items` as
the single catalog source of truth while making variance one SQL view.

Sketch (not final):

```sql
create table public.invoices (
  invoice_number text primary key,
  issue_date     date not null,
  source_file    text,
  scanned_at     timestamptz not null default now()
);

create table public.invoice_lines (
  id             bigserial primary key,
  invoice_number text not null references public.invoices on delete cascade,
  sku            text not null,          -- joins to items.data->>'sku'
  size           text not null,
  category       text not null,
  colour         text not null,
  qty            numeric not null,
  raw_description text not null,
  unique (invoice_number, sku)
);
```

No customer column by design — see Blocker 2.

## Phases

Each phase is independently useful and independently shippable.

1. **Catalog-driven parsing.** invoice-checker reads the item list from
   Supabase, caches it to disk, and resolves descriptions to real SKUs.
   Fixes Blocker 1. No writes, no schema change, no app change.
2. **Push invoices.** Create the two tables. invoice-checker upserts via a
   service-role key, keyed on invoice number so re-scans stay idempotent
   (it already re-reads changed PDFs and regenerates from the ledger).
   Product data only.
3. **Variance view.** SQL view of sold vs counted per SKU per period.
4. **Surface in the app.** Read-only variance screen in inventory-app.

## Open questions — get answers before building phase 2

- **Unmatched products.** When an invoice names something not in the catalog:
  auto-create the item, or hold it for review? Recommendation: hold it.
  Auto-creating lets a typo silently become a catalog entry.
- **Catalog ownership.** Recommendation: inventory-app owns items, one-way.
  invoice-checker reads, never writes.
- **Offline behaviour.** If Supabase is unreachable, should scanning still
  work? Recommendation: yes — cache the catalog to disk so a scan never blocks
  on the network.
- **Credentials.** Phase 2 needs a service-role key for invoice-checker. It
  must go in a gitignored `.env`, never in `config.json`.

## Current state of invoice-checker

Working and pushed. `npm test` (21 tests) passes; `npm run scan` reads the five
sample PDFs and produces `bin-and-lid-sales.xlsx` with Sales log / Totals /
Needs review sheets. See `README.md` for commands.

Environment notes: Python is **not** installed on this machine (only the
Microsoft Store stub) — use Node. The GitHub CLI `gh` is not installed either,
but `git` over HTTPS works with cached credentials. If a scan reports it wrote a
timestamped copy, the workbook is open in Excel; close it and re-run.
