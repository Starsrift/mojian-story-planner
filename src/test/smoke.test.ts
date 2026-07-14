import { expect, test } from 'vitest'

test('provides IndexedDB in the test environment', () => {
  expect(indexedDB).toBeDefined()
})
