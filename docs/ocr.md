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

## The engine is self-hosted — done 2026-08-27

The engine and language model are served from **this app's own origin**, not a
public CDN. `public/tesseract/` holds them and they are committed:

| File | ~size | From |
|---|---|---|
| `worker.min.js` | 111 KB | `tesseract.js` |
| `tesseract-core-simd-lstm.wasm.js` | 3.9 MB | `tesseract.js-core` |
| `eng.traineddata.gz` | 2.0 MB | tessdata `4.0.0_fast` |

**Why it mattered.** No document was ever sent to the CDN — only the model came
back. But this page holds PHI in memory, and anyone able to serve script into
it could read that. A third-party origin in the loading path is a supply-chain
risk not worth carrying on a HIPAA system.

`ASSET_PATHS` in `src/lib/ocr.ts` points at `/tesseract`. Nothing is fetched
until a staff member actually reads a scan, so the 5.9 MB is not in the initial
page load.

### Refreshing them

After upgrading `tesseract.js`, re-copy the two engine files so they match the
installed version:

```bash
cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js public/tesseract/
```

The language model rarely changes; it came from
`https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz`.

**Verify after any change** — all three must return 200 from the app's own
origin, and nothing should be requested from `tessdata.projectnaptha.com`:

```bash
for f in worker.min.js tesseract-core-simd-lstm.wasm.js eng.traineddata.gz; do curl -s -o /dev/null -w "$f %{http_code}
" "http://localhost:8081/tesseract/$f"; done
```
