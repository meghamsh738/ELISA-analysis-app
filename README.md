# EasyLab Next — ELISA Analysis

A local, guided workflow for one 96-well plate. This development version lives on `codex/easylab-next-20261113`; the original app and installed EasyLab Suite remain separate.

## Workflow

1. **Import & map:** preview reader rows and confirm sample IDs, groups, standard levels, blanks and dilution factors. Raw 450/570 blocks and well tables are supported; corrected input requires an explicit Absorbance/Net column. Invalid and unmatched rows remain visible.
2. **Standards & blanks:** choose custom or labelled legacy settings, set units and concentrations, and review the selected blank wells and mean/median offset. Already blank-corrected input cannot be subtracted again.
3. **Review fit:** inspect retained/excluded wells, replicate spread, polynomial or 4PL fits, residuals and back-calculated standards. Exclusions require reasons. Automated checks never remove observations.
4. **Concentrations:** review biological samples and individual wells. Out-of-range, invalid and excluded wells have no final endpoint. Dilution is applied once. Partial replicate results and conflicting sample groups are explicit.
5. **Graphs & export:** biological-sample dots and group means, optional SD/SEM, editable appearance, CSV/TSV/XLSX, PNG/SVG and printable PDF reports. Final tables and figures require the preceding reviews.

Every upstream edit invalidates dependent approvals. Undo and confirmed resets are available. Local autosave, named assay presets/layouts and versioned `.easylab.json` packages retain source copies, decisions, results and graph settings. New experiments retain the chosen recipe/display settings but require fresh mapping and scientific review.

The **custom assay** is an unvalidated starting template. The **legacy preset** preserves the former concentration series and curve/correction choices; it is not a validated kit protocol. Only monotonic reviewed polynomial ranges can be inverted. A 4PL curve needs sufficient positive standards; no universal curve choice or kit validation is claimed.

## Try the separate development version

Verified with Node **24.22.1**, npm **11.13.0**. Dependencies are installed in this Next worktree; Plotly **3.1.0** and ExcelJS **4.4.0** are pinned. Existing framework versions are retained.

```sh
cd '/Volumes/Coding Projects/Active/easylab-next/modules/elisa-analysis'
npm run dev
```

Open `http://127.0.0.1:18514` and choose **Open practice experiment**. The fictional plate contains six valid biological samples and two deliberately out-of-range samples. Development, preview and browser tests use the same strict loopback port and refuse an occupied listener.

Browser data uses only `easylab-next:elisa:*` storage keys at this separate origin. The standalone Electron development identity is `ELISA Analysis Next (Dev)`; it loads local built assets and uses `easylab-next/runtime/elisa-standalone` in this multi-module checkout. It does not read the stable app's profile. Suite integration uses a bundled static page, without an ELISA listener. The Suite source manifest must match the committed ELISA revision before syncing artifacts.

## Checks and limits

```sh
npm test
npm run test:runtime
npm run test:e2e
npm run lint
npm run build
```

The scientific fixtures cover correction state, blank mean/median, monotonic inversion, range boundaries, dilution, exclusions, missing data, technical replicate summaries and identity conflicts. Parser tests cover malformed/duplicate/unmatched records, shifted plate columns and corrected-input selection. Browser tests cover guided review, invalidation, downloads, package reopen and keyboard/narrow-window behavior.

See [phase-2 evidence](design-review/next-elisa-phase-2/README.md) for the recorded checks and rendered exports. Native Excel, packaged macOS/installed-app behavior and Windows remain unverified. No merge, installation or release has been performed.

Implementation references: [Plotly React integration](https://plotly.com/javascript/react/), [static image export](https://plotly.com/javascript/static-image-export/), [ExcelJS browser support](https://github.com/exceljs/exceljs#browser), [Electron application paths](https://www.electronjs.org/docs/latest/api/app), and [Vite server options](https://vite.dev/config/server-options).
