import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/integration/**/*.integration.js'],
        setupFiles: [],
        minWorkers: 1,
        maxWorkers: 1,
        hookTimeout: 120000,
        testTimeout: 15000,
    },
});
