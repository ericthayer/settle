/** True when a lazy route's file is gone, i.e. a new deploy replaced the one this tab loaded. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(message)
}
