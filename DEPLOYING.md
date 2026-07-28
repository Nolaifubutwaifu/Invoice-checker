# Deploying the website

The site lives in `app/` and shares its parser with the CLI, so the browser and
the warehouse PC can never disagree about what an invoice contains.

Both routes build to **static pages** — there are no server functions, no
database calls at build time, and nothing to keep warm.

## Vercel setup

1. **New Project → import `Nolaifubutwaifu/Invoice-checker`.**
2. Leave every build setting at its default. Vercel detects Next.js and runs
   `npm run build`, which copies the pdf.js worker into `public/` first.
   - Framework preset: Next.js
   - Root directory: `./` (the repo root — do **not** point it at a subfolder)
3. Deploy.

### Custom domain

Project → Settings → Domains → add `invoice-scanner.taigaprojects.space`.

Vercel will show the DNS record to create at whoever hosts `taigaprojects.space`
— normally a `CNAME` on the `invoice-scanner` subdomain pointing at
`cname.vercel-dns.com`. Once it resolves, the certificate is issued
automatically.

### Environment variables — only for the Dashboard

The **Scan invoices** page needs none: it works on a fresh deploy with no
configuration at all.

The **Dashboard** reads from Supabase and stays in a "Not connected" state
until these are set under Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

They are `NEXT_PUBLIC_`, so they are **baked in at build time and visible to
anyone who loads the page** — redeploy after changing them, and never put a
service-role key here.

Even with those set, the dashboard has nothing to show until phase 2 of
[INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) creates the invoice tables. The page
says so explicitly rather than failing blankly.

## What runs where

| | Where it runs | Needs a database |
| --- | --- | --- |
| Scan invoices page | Entirely in the browser | No |
| Dashboard | Browser, reading Supabase | Yes — phase 2 |
| `npm run scan` / `watch` | The warehouse PC | No |

**The 10-minute folder watch cannot move to Vercel.** There is no folder to
watch on a serverless host, so `npm run watch` stays on the PC that has the
invoices. The website is for dropping invoices in by hand from any device, and
for viewing what the PC scanner has already recorded.

## Privacy

Invoices carry customer names, addresses, phone numbers and Brisbins bank
details. On the Scan invoices page the PDFs are read in the browser with
`FileReader` and pdf.js — **nothing is uploaded**, and no server ever sees them.
Closing the tab discards everything; there is no persistence.

That is also why the planned database work stores no customer names: see
Blocker 2 in [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md).

## Local development

```bash
npm run dev
```

Then open http://localhost:3000. `predev` copies the pdf.js worker into
`public/`, which is gitignored because it is a copy of an installed dependency,
not source.

To check the production build before pushing:

```bash
npm run build
```
