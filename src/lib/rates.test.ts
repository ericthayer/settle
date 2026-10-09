import { bpsToPercentInput, percentInputToBps } from './rates'

describe('tax rate conversion', () => {
  it('formats basis points as a trimmed percent', () => {
    expect(bpsToPercentInput(825)).toBe('8.25')
    expect(bpsToPercentInput(1000)).toBe('10')
    expect(bpsToPercentInput(50)).toBe('0.5')
    expect(bpsToPercentInput(0)).toBe('0')
  })
  it('parses percent input to basis points', () => {
    expect(percentInputToBps('8.25')).toBe(825)
    expect(percentInputToBps('8.25%')).toBe(825)
    expect(percentInputToBps('.5')).toBe(50)
    expect(percentInputToBps('')).toBe(0)
    expect(percentInputToBps('100')).toBe(10_000)
  })
  it('rejects invalid or out-of-range input', () => {
    expect(percentInputToBps('8.255')).toBeNull()
    expect(percentInputToBps('101')).toBeNull()
    expect(percentInputToBps('-1')).toBeNull()
    expect(percentInputToBps('abc')).toBeNull()
  })
})

describe('timeZones', () => {
  it('always offers UTC and the current value', async () => {
    const { timeZones } = await import('./currencies')
    const zones = timeZones('Etc/GMT+5')
    expect(zones).toContain('UTC')
    expect(zones).toContain('Etc/GMT+5')
  })
})
