# ELISA Analysis App

Standalone app for ELISA 96-well plate layout + analysis (net absorbance, standard curves, quantification).

![ELISA Analysis App overview](docs/screenshots/overview.png)

## What It Does

- Build a 96-well plate layout from a pasted sample table (TSV/CSV).
- Only **Animal ID** is rendered inside the wells (other columns are preserved as metadata).
- Select wells (including Shift-click range selection) and assign:
  - `Standard` levels (ex: `Std1`, `Std2`, ...)
  - `Blank`
  - sample metadata like dilution factor / group override
- Paste ELISA reader exports with **450 nm** and **570 nm** blocks.
- Compute **net absorbance**: `A450 - A570` (optional blank subtraction).
- Fit polynomial standard curves (degree 2/3), with:
  - per-replicate keep/remove
  - outlier flagging to help decide removals
- Quantify unknowns and export tables as TSV.

## Quick Start (Web)

Requirements: Node 20+.

```bash
npm ci
npm run dev
```

Then open `http://localhost:5180`.

## Quality Checks

```bash
npm run lint
npm test
```

E2E smoke test (Playwright):

```bash
npm run test:e2e
```

## Inputs

Layout input: paste a table where one column is `Animal ID` (and optionally `Group`). The app can auto-guess, but you can override mappings.

Reader input: paste the plate reader output that includes the 450 nm and 570 nm matrices (the app also supports a fallback list format).

## Roadmap

- Desktop installer (Electron)
- Merge into EasyLab Suite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
