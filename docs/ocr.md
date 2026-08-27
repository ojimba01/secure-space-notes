# Reading scanned documents

About 45% of the PDFs in the historical archive are flat scans: no form fields,
no text layer, nothing a parser can read. The largest single group is detached
signature pages — one scanned page whose filename says only "SIGNED FORM".

Those pages do carry the form's name in the printed footer, so reading the
pixels resolves them. That is what the OCR tier is for.

## What it does and does not do

It reads **printed** text well and **handwriting** poorly. In practice that
means it reliably answers *what kind of document is this*, and will pull a
member ID off a typed or faxed form, but it will not read a handwritten
Medicaid number. It improves classification far more than client matching.

## Where it runs

Entirely in the browser, in a web worker. **The document never leaves the
computer.** Cloud OCR (Google Vision, AWS Textract) would mean transmitting
client records to a third party and would need a BAA; this does not.

## What it costs

Nothing in licensing — Tesseract.js is Apache-2.0, with no API fees and no
per-page charge. The cost is a one-time download of roughly 7 MB (the
WebAssembly engine plus the "fast" English model), fetched on first use and
cached by the browser afterwards. It is loaded on demand, so staff who never
import a scan never download it.

Measured on the agency's own scanned templates: about 0.4 seconds per page
once warm, and roughly 1.5 seconds on the very first page including the
download.

## How it is wired in

`recognizeDocument()` runs three tiers in order — AcroForm fingerprint, then
the text layer, then the filename. OCR sits between the second and third, and
only runs when a file has neither fields nor text **and** the caller opts in.
It feeds the same printed-title matching the text-layer tier uses, so adding
it required no new matching rules.

In the bulk importer it is the **"Read scanned files"** checkbox, off by
default. Turning it on adds a few hundred milliseconds per scanned file.

## Self-hosting the engine (recommended before production)

By default the engine and language model come from a public CDN
(`tessdata.projectnaptha.com`). No document is sent there — only the model is
fetched — but the page holds PHI in memory, and a third party able to serve
script into it is a supply-chain risk worth removing.

To self-host, copy the engine and model into `public/tesseract/` and point
`ASSET_PATHS` in `src/lib/ocr.ts` at your own origin:

```bash
mkdir -p public/tesseract
cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js public/tesseract/
curl -L -o public/tesseract/eng.traineddata.gz \
  https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz
```

Then set `workerPath`, `corePath` and `langPath` to `/tesseract`. This adds
about 7 MB of static assets to the repository.
