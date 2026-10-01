// eslint.config.js — correctness only.
//
// This is not a style gate. A .prettierrc.json sits beside this file and Prettier is not installed
// (docs/known-issues.md); the rules below are the ones whose every finding is a bug: a name that is not defined, a key given
// twice, code after a return, an assignment to a const. The first run of this configuration
// (docs/design/lint-and-accessibility-2026-10-01.md) found three ReferenceErrors that had been
// reachable from the UI for months, which is the case for having it. Run with `npm run lint`.
//
// Rules the recommended sets carry that are opinions rather than defects are switched off here
// with the count they would have raised on 2026-10-01, so that whoever enables one knows the size
// of the job.
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'dist-scenery/**', 'node_modules/**', 'src/CE_Application/generated/**'] },
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
        __JUCE__: 'readonly',
        __APP_BUILD__: 'readonly',   // vite `define`, see vite.config.js
        ImageDecoder: 'readonly',    // WebCodecs; guarded at the call site
      },
    },
    rules: {
      'no-unused-vars': 'off',               // 264
      'no-useless-assignment': 'off',        // 38
      'no-useless-escape': 'off',            // 4
      'no-control-regex': 'off',             // 1, deliberate in scriptDocumentModel.js
      'no-irregular-whitespace': 'off',      // 1, a U+00A0 in an SVG import fixture string
      'preserve-caught-error': 'off',        // 1
      'svelte/require-each-key': 'off',      // 380
      'svelte/prefer-svelte-reactivity': 'off', // 83
      'svelte/no-unused-svelte-ignore': 'off',  // 13
      'svelte/no-useless-children-snippet': 'off', // 6
      'svelte/no-at-html-tags': 'off',       // 3, each one renders text the app produced itself
      'svelte/no-dom-manipulating': 'off',   // 2, the notepad's contenteditable
      'svelte/no-useless-mustaches': 'off',  // 1
      'svelte/prefer-writable-derived': 'off', // 2
    },
  },
  {
    // The scrub components are TypeScript inside Svelte; the parser here is JavaScript only.
    ignores: ['src/CE_Application/scrub/JuceScrub.svelte', 'src/CE_Application/scrub/ScrubControl.svelte'],
  },
];
