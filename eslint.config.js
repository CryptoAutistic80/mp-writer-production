const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.{js,ts,tsx}'],
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.spec.ts',
      '**/*.spec.tsx', 
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/src/**/*.spec.ts',
      '**/src/**/*.spec.tsx',
      '**/src/**/*.test.ts',
      '**/src/**/*.test.tsx',
      'backend-api/src/**/*.spec.ts',
      'backend-api/src/**/*.spec.tsx',
      'backend-api/src/**/*.test.ts',
      'backend-api/src/**/*.test.tsx',
    ],
  },
  js.configs.recommended,
  // Backend API TypeScript config
  {
    files: ['backend-api/**/*.ts'],
    ignores: [
      '**/dist/**',
      '**/*.spec.ts',
      '**/*.test.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./backend-api/tsconfig.app.json'],
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        NodeJS: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'caughtErrorsIgnorePattern': '^_'
      }],
    },
  },
  // Frontend TypeScript config
  {
    files: ['frontend/**/*.{ts,tsx}', 'frontend/**/*.js'],
    ignores: [
      'frontend/.next/**',
      'frontend/dist/**',
      'frontend/**/*.spec.ts',
      'frontend/**/*.spec.tsx',
      'frontend/**/*.test.ts',
      'frontend/**/*.test.tsx',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        Image: 'readonly',
        // Events
        PointerEvent: 'readonly',
        // Animation
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Media APIs
        MediaRecorder: 'readonly',
        MediaStream: 'readonly',
        EventSource: 'readonly',
        AudioContext: 'readonly',
        AnalyserNode: 'readonly',
        // Fetch API types
        Request: 'readonly',
        Response: 'readonly',
        // TypeScript types
        RequestInit: 'readonly',
        // Node.js globals for Next.js
        process: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        NodeJS: 'readonly',
        // Next.js specific
        React: 'writable',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'caughtErrorsIgnorePattern': '^_'
      }],
      // Disable type-aware rules (no tsconfig project configured for frontend)
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/require-await': 'off',
      // Disable Next.js specific rules (Next.js plugin not installed)
      '@next/next/no-img-element': 'off',
    },
  },
];

