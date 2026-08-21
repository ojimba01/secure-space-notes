import { pdfjs } from 'react-pdf';

// Serve the PDF.js worker from our own bundle instead of a CDN, so PDF
// rendering works offline and in restricted environments. The version always
// matches react-pdf's bundled API because package.json pins the same
// pdfjs-dist release react-pdf depends on.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
