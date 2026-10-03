import { defineConfig } from 'vitest/config';

// Keep contract tests independent of the legacy MongoDB-backed global setup.
export default defineConfig({
    test: {
        include: ['test/contracts/**/*.contract.js'],
        setupFiles: [],
        minWorkers: 1,
        maxWorkers: 1,
    },
});
