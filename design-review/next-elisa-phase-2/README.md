# ELISA Next phase 2 — checked development milestone

17 November 2026 · branch `codex/easylab-next-20261113` · friendly version `next-elisa-phase-2-20261117`.

This record belongs to the commit containing it. The preview ran from this Next checkout at strict loopback `127.0.0.1:18514`, using a fresh browser profile and fictional data. Original applications, repositories, settings and lab data were not used.

## What was checked

- **46 unit tests:** correction and blank rules, polynomial/4PL inversion, range boundaries, dilution, reasoned exclusions, missing observations, technical-replicate summaries, sample identities, parser row integrity, experiment packages and exports.
- **8 runtime tests:** distinct profiles, downloads and settings; rejection of symlinked runtime/build/cache paths and inherited source/server overrides.
- **5 browser tests:** full guided review; graph/table/package agreement; malformed and duplicate rows; correction consistency; upstream invalidation/undo; corrected-input validation; narrow resizing after print; dialog keyboard focus.
- Production TypeScript/Vite build and ESLint pass. Plotly and ExcelJS are lazy-loaded; Vite reports their expected large-chunk warnings.
- **17 independent production-browser checks:** all five review steps; six expected biological sample values; PNG at 900×500 and 1100×550; SVG; CSV and reopened Excel workbook; saved experiment reopened with reviewed choices and appearance; 768 px graph layout and keyboard navigation; already-corrected input. No console warnings/errors, uncaught page errors, failed requests or external HTTP requests were observed.
- The practice print report was rendered and inspected on every page. The report uses a prepared 900×300 vector figure, independent of editable image-export dimensions. Its Print action waits for the figure matching the current data and settings.

Expected fictional concentrations are **6, 7, 8, 14, 16 and 18 ng/mL** after the declared twofold dilution. Sample 7 is above range and Sample 8 below range; both retain visible reasons and blank final endpoints. All tables, six plotted points and workbook values agree within numerical tolerance.

## Review fixes

The independent code review found two import defects and confirmed their fixes: missing separators in plate rows now block all affected values, and corrected input validates its explicit Absorbance/Net column independently of unused raw wavelengths. Ragged list rows also block confirmation. No P1/P2 issue remained in the scoped recheck.

The rendered review identified delayed graph resizing and inefficient report layout. The graph now sizes directly to its container; print uses a prepared vector image and a white page background. The small follow-up graphics diff passed its scoped code review and rendered checks.

## Evidence

- [Import and mapping](02-import-mapping.png)
- [Standard fit and diagnostics](03-standard-fit.png)
- [Sample graph on desktop](05-graph-desktop.png)
- [Sample graph at 768 px](05-graph-narrow.png)
- [Corrected-input review](corrected-input-review.png)
- [Production browser record](qa-results.json)
- [Sample SVG](practice-sample-graph.svg)
- [Practice print report](practice-print.pdf)
- [Practice workbook](practice-review.xlsx)
- [Reopenable practice experiment](practice-experiment.easylab.json)

## Limits

This is development source, not an installed release. Native Excel, packaged macOS/installed-app behavior and Windows remain unverified. Full Suite artifact sync and package checks are a separate integration step; their existing source-pin and artifact-receipt guards are retained. No merge, installed-app replacement or public release was performed.

The scoped dependencies are Plotly 3.1.0 and ExcelJS 4.4.0, with the existing React/Vite/Electron versions retained. The installer reported 47 dependency-tree audit advisories; no broad dependency update or audit-fix operation was performed.
