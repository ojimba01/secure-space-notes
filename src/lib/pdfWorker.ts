import '@/lib/promiseWithResolvers';
import { pdfjs } from 'react-pdf';
import PdfJsWorker from '@/lib/pdfjsWorkerEntry?worker';

// Run the PDF.js worker from our own bundle instead of a CDN, handing pdfjs a
// live worker port. Vite emits the worker as a regular hashed .js chunk, which
// avoids the wrong-MIME problems some hosts have serving .mjs files to
// `new Worker(...)`. The version always matches react-pdf's bundled API
// because package.json pins the same pdfjs-dist release react-pdf depends on.
if (!pdfjs.GlobalWorkerOptions.workerPort) {
  pdfjs.GlobalWorkerOptions.workerPort = new PdfJsWorker();
}
