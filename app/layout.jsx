import './globals.css';
import { Nav } from './nav.jsx';

export const metadata = {
  title: 'Invoice Scanner — bins and lids sold',
  description:
    'Reads Brisbins invoice PDFs and records the bins and lids sold on a spreadsheet.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-AU">
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                ▤
              </span>
              Invoice Scanner
            </a>
            <Nav />
          </div>
        </header>
        <div className="shell">
          {children}
          <footer className="foot">
            Bins and lids only — spare parts, freight and pickup notes are ignored.
          </footer>
        </div>
      </body>
    </html>
  );
}
