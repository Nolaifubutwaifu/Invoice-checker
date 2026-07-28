'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Read-only view of everything the PC scanner has pushed to the database.
 *
 * The invoice tables are phase 2 of INTEGRATION_PLAN.md and do not exist yet,
 * so this page is written to say exactly which step is outstanding rather than
 * failing blankly. The query is the real one — it starts working the moment the
 * tables are created.
 */

const URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL';
const KEY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 42P01 is Postgres for "relation does not exist" — i.e. phase 2 not built yet.
const MISSING_TABLE = '42P01';

export default function DashboardPage() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setState({ status: 'unconfigured' });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        const { data, error } = await supabase
          .from('invoice_lines')
          .select('invoice_number, sku, size, category, colour, qty, raw_description')
          .order('invoice_number', { ascending: false })
          .limit(1000);

        if (cancelled) return;
        if (error) {
          setState(
            error.code === MISSING_TABLE
              ? { status: 'no-tables' }
              : { status: 'error', message: error.message },
          );
          return;
        }
        setState({ status: 'ready', rows: data ?? [] });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (state.status !== 'ready') return null;
    const byProduct = new Map();
    for (const r of state.rows) {
      const key = r.sku || `${r.size} ${r.category} ${r.colour}`;
      if (!byProduct.has(key)) {
        byProduct.set(key, { key, size: r.size, category: r.category, colour: r.colour, qty: 0 });
      }
      byProduct.get(key).qty += Number(r.qty ?? 0);
    }
    return {
      invoices: new Set(state.rows.map((r) => r.invoice_number)).size,
      products: [...byProduct.values()].sort((a, b) => b.qty - a.qty),
      units: state.rows.reduce((s, r) => s + Number(r.qty ?? 0), 0),
    };
  }, [state]);

  return (
    <main>
      <h1>Dashboard</h1>
      <p className="lede">
        Bins and lids sold, as recorded by the scanner running on the warehouse PC.
      </p>

      {state.status === 'loading' && <div className="empty">Loading…</div>}

      {state.status === 'unconfigured' && (
        <div className="notice" data-tone="warn">
          <strong>Not connected to the database</strong>
          <p>
            Add these environment variables in Vercel (Project → Settings → Environment
            Variables) and redeploy. They are read at build time.
          </p>
          <pre>
            <code>
              {URL_VAR}=https://&lt;project-ref&gt;.supabase.co{'\n'}
              {KEY_VAR}=&lt;anon public key&gt;
            </code>
          </pre>
        </div>
      )}

      {state.status === 'no-tables' && (
        <div className="notice" data-tone="warn">
          <strong>Connected, but there is nothing to show yet</strong>
          <p>
            The database is reachable, but the <code>invoice_lines</code> table has not
            been created. That is phase 2 in <code>INTEGRATION_PLAN.md</code>: creating
            the invoice tables and having the scanner push to them.
          </p>
          <p>Until then, use the Scan invoices page, which needs no database.</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="notice" data-tone="error">
          <strong>Could not read the database</strong>
          <p>{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && totals && (
        <>
          <div className="stats">
            <Stat value={totals.invoices} label="Invoices" />
            <Stat value={totals.units} label="Items sold" />
            <Stat value={totals.products.length} label="Distinct products" />
          </div>

          {totals.products.length === 0 ? (
            <div className="empty">
              No invoices have been recorded yet. Run <code>npm run scan</code> on the
              warehouse PC.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Item</th>
                    <th>Colour</th>
                    <th className="num">Qty sold</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.products.map((p) => (
                    <tr key={p.key}>
                      <td>{p.key}</td>
                      <td>{p.size}</td>
                      <td>
                        <span className="pill" data-kind={p.category}>
                          {p.category}
                        </span>
                      </td>
                      <td>{p.colour}</td>
                      <td className="num">{p.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
