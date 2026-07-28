'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Everything happens in the browser: the PDFs are never uploaded anywhere.
 * That matters here because invoices carry customer names, addresses and bank
 * details.
 *
 * The parser modules are the same ones the CLI uses, imported lazily so the
 * heavy pdf.js and exceljs bundles are only fetched once a file is dropped.
 */
async function loadEngine() {
  const [pdfCore, records] = await Promise.all([
    import('../src/pdf-core.js'),
    import('../src/records.js'),
  ]);

  // Served as a static asset by scripts/copy-pdf-worker.mjs.
  pdfCore.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  return {
    extract: pdfCore.extractInvoiceFromData,
    toRecords: records.recordsFromInvoice,
  };
}

export default function ScanPage() {
  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(async (fileList) => {
    const pdfs = [...fileList].filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;

    setBusy(true);
    try {
      const { extract, toRecords } = await loadEngine();
      const nextRows = [];
      const nextFiles = [];

      for (const file of pdfs) {
        try {
          const invoice = await extract(await file.arrayBuffer());
          const found = toRecords(invoice, file.name);
          nextRows.push(...found);
          nextFiles.push({
            name: file.name,
            invoiceNumber: invoice.invoiceNumber,
            items: found.length,
          });
        } catch (err) {
          nextFiles.push({ name: file.name, error: err.message });
        }
      }

      // Re-dropping the same invoice replaces its rows rather than doubling them.
      setRows((prev) => [
        ...prev.filter((r) => !nextFiles.some((f) => f.name === r.file)),
        ...nextRows,
      ]);
      setFiles((prev) => [
        ...prev.filter((f) => !nextFiles.some((n) => n.name === f.name)),
        ...nextFiles,
      ]);
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const totals = useMemo(() => {
    const byProduct = new Map();
    for (const r of rows) {
      byProduct.set(r.product, (byProduct.get(r.product) ?? 0) + (r.qty ?? 0));
    }
    return {
      invoices: new Set(rows.map((r) => r.invoiceNumber)).size,
      bins: rows.filter((r) => r.component === 'Bin').reduce((s, r) => s + (r.qty ?? 0), 0),
      lids: rows.filter((r) => r.component === 'Lid').reduce((s, r) => s + (r.qty ?? 0), 0),
      products: byProduct.size,
      flagged: rows.filter((r) => r.review?.length).length,
    };
  }, [rows]);

  const download = useCallback(async () => {
    const { buildWorkbook } = await import('../src/sheet-core.js');
    const buffer = await buildWorkbook(rows).xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bin-and-lid-sales.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  const reset = useCallback(() => {
    setRows([]);
    setFiles([]);
  }, []);

  return (
    <main>
      <h1>Scan invoices</h1>
      <p className="lede">
        Drop invoice PDFs below to pull out the bins and lids sold. Everything runs in
        this browser — the files are never uploaded.
      </p>

      <div
        className="dropzone"
        data-over={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <strong>{busy ? 'Reading…' : 'Drop invoice PDFs here'}</strong>
        <p>or click to choose files</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.name}>
              <span className="name">{f.name}</span>
              <span className="meta" data-tone={f.error ? 'error' : undefined}>
                {f.error
                  ? `could not read — ${f.error}`
                  : `invoice ${f.invoiceNumber || '?'} · ${f.items} item${f.items === 1 ? '' : 's'}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <>
          <div className="stats" style={{ marginTop: 28 }}>
            <Stat value={totals.invoices} label="Invoices" />
            <Stat value={totals.bins} label="Bins sold" />
            <Stat value={totals.lids} label="Lids sold" />
            <Stat value={totals.products} label="Distinct products" />
            <Stat value={totals.flagged} label="Need review" />
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={download}>
              Download spreadsheet
            </button>
            <button className="btn" onClick={reset}>
              Clear
            </button>
          </div>

          {totals.flagged > 0 && (
            <div className="notice" data-tone="warn">
              <strong>{totals.flagged} line(s) need a look</strong>
              <p>
                Shown in the table below. Usually a colour that is not in the product
                catalog, or a description with no size in it.
              </p>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Item</th>
                  <th>Colour</th>
                  <th className="num">Qty</th>
                  <th>Raw description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.invoiceNumber}</td>
                    <td>{r.issueDate}</td>
                    <td>{r.product}</td>
                    <td>
                      <span className="pill" data-kind={r.component}>
                        {r.component}
                      </span>
                    </td>
                    <td>{r.colour}</td>
                    <td className="num">{r.qty}</td>
                    <td className="wide">
                      {r.description}
                      {r.review?.length > 0 && (
                        <>
                          {' — '}
                          <span style={{ color: 'var(--warn)' }}>{r.review.join('; ')}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length === 0 && files.length > 0 && !busy && (
        <div className="notice">
          <strong>No bins or lids found</strong>
          <p>
            Those invoices only contained spare parts, freight or notes, all of which
            are ignored on purpose.
          </p>
        </div>
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
