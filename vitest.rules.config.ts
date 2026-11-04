import { defineConfig } from 'vitest/config'

// Security rules tests need the Firebase emulators, so they run separately: npm run test:rules
export default defineConfig({ test: { environment: 'node', include: ['tests/rules.test.ts'], testTimeout: 20000 } })
