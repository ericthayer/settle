/** Tax rates are stored as integer basis points (825 = 8.25%). */

export function bpsToPercentInput(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, '')
}

/** "8.25" -> 825. Returns null for invalid input or values outside 0-100%. */
export function percentInputToBps(input: string): number | null {
  const cleaned = input.replace(/[\s%]/g, '')
  if (cleaned === '') return 0
  if (!/^\d{1,3}(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null
  const bps = Math.round(Number(cleaned) * 100)
  return bps >= 0 && bps <= 10_000 ? bps : null
}
