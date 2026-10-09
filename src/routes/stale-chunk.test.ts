import { isStaleChunkError } from './stale-chunk'

describe('isStaleChunkError', () => {
  it('recognises Chrome, Safari and Firefox stale-chunk messages', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/A.js'))).toBe(true)
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true)
  })

  it('ignores ordinary errors', () => {
    expect(isStaleChunkError(new Error('boom'))).toBe(false)
  })
})
