import { EMPTY_ADDRESS, formatAddressLines, parseAddress, toAddressJson } from './address'

describe('address helpers', () => {
  it('parses jsonb defensively', () => {
    expect(parseAddress(null)).toEqual(EMPTY_ADDRESS)
    expect(parseAddress(['x'])).toEqual(EMPTY_ADDRESS)
    expect(parseAddress({ city: 'Portland', zip: 1, line1: 5 })).toEqual({ ...EMPTY_ADDRESS, city: 'Portland' })
  })
  it('formats display lines and drops empty parts', () => {
    expect(
      formatAddressLines({ line1: '1 Main St', line2: '', city: 'Portland', region: 'OR', postal_code: '97201', country: 'USA' }),
    ).toEqual(['1 Main St', 'Portland, OR 97201', 'USA'])
    expect(formatAddressLines({ ...EMPTY_ADDRESS, region: 'OR' })).toEqual(['OR'])
  })
  it('trims fields for storage', () => {
    expect(toAddressJson({ ...EMPTY_ADDRESS, line1: '  1 Main  ' }).line1).toBe('1 Main')
  })
})
