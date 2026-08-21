// Entry point for the bundled PDF.js worker. The polyfill import must come
// first so Promise.withResolvers exists before the worker code evaluates
// (matters for Safari < 17.4).
import '@/lib/promiseWithResolvers';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
