/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 uses Turbopack by default. Nothing to configure: the modules the
  // browser loads (`src/pdf-core.js`, `src/records.js`, `src/sheet-core.js`)
  // deliberately import no Node built-ins, and exceljs resolves to its own
  // browser build. The Node-only wrappers live in `src/pdf.js` and
  // `src/sheet.js`, which the site never imports.
  turbopack: {},
};

export default nextConfig;
