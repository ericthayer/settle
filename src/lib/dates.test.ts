import { addDays, formatDate, isIsoDate, todayIn } from './dates'

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('10/09/2026')).toBe(false)
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('reads today in the owner time zone, not the browser', () => {
    const instant = new Date('2026-10-09T03:30:00Z')
    expect(todayIn('UTC', instant)).toBe('2026-10-09')
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-10-08')
  })

  it('formats without shifting the day', () => {
    expect(formatDate('2026-10-09', 'en-US')).toBe('Oct 9, 2026')
    expect(formatDate(null)).toBe('—')
  })
})
