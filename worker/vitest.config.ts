import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: [
        'src/types.ts',
        'src/types/**',
        'src/**/types.ts',
        'src/**/*.d.ts',
        'migrations/**',
        'test/**',
        'node_modules/**',
      ],
    },
  },
});
