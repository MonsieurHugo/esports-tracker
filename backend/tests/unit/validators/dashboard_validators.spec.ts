import { test } from '@japa/runner'
import { historyBatchQueryValidator } from '#validators/dashboard_validators'

test.group('Dashboard Validators - entityIds validation', () => {
  test('accepts valid IDs', async ({ assert }) => {
    const input = { entityIds: '1,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
  })

  test('accepts single ID', async ({ assert }) => {
    const input = { entityIds: '42' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [42])
  })

  test('filters negative numbers', async ({ assert }) => {
    const input = { entityIds: '-1,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('filters zero', async ({ assert }) => {
    const input = { entityIds: '0,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('filters decimals', async ({ assert }) => {
    const input = { entityIds: '1.5,2,3.7' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2])
  })

  test('filters oversized numbers', async ({ assert }) => {
    const input = { entityIds: '9999999999999,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    // The huge number exceeds PostgreSQL INT max (2147483647)
    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('accepts PostgreSQL INT max value', async ({ assert }) => {
    const input = { entityIds: '2147483647,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2147483647, 2, 3])
  })

  test('filters numbers exceeding PostgreSQL INT max', async ({ assert }) => {
    const input = { entityIds: '2147483648,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('filters non-numeric strings', async ({ assert }) => {
    const input = { entityIds: 'abc,2,xyz,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('filters leading zeros', async ({ assert }) => {
    const input = { entityIds: '01,002,3' }
    const result = await historyBatchQueryValidator.validate(input)

    // Leading zeros are filtered because trimmed !== String(num)
    assert.deepEqual(result.entityIds, [3])
  })

  test('handles whitespace around IDs', async ({ assert }) => {
    const input = { entityIds: ' 1 , 2 , 3 ' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
  })

  test('handles multiple consecutive commas', async ({ assert }) => {
    const input = { entityIds: '1,,2,,,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
  })

  test('handles trailing comma', async ({ assert }) => {
    const input = { entityIds: '1,2,3,' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
  })

  test('deduplicates IDs', async ({ assert }) => {
    const input = { entityIds: '1,2,3,2,1' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
  })

  test('rejects more than 50 IDs', async ({ assert }) => {
    // Generate 51 valid IDs
    const ids = Array.from({ length: 51 }, (_, i) => i + 1).join(',')
    const input = { entityIds: ids }

    await assert.rejects(
      async () => await historyBatchQueryValidator.validate(input),
      'Maximum 50 entity IDs allowed'
    )
  })

  test('accepts exactly 50 IDs', async ({ assert }) => {
    // Generate exactly 50 valid IDs
    const ids = Array.from({ length: 50 }, (_, i) => i + 1).join(',')
    const input = { entityIds: ids }

    const result = await historyBatchQueryValidator.validate(input)

    assert.lengthOf(result.entityIds, 50)
    assert.deepEqual(result.entityIds, Array.from({ length: 50 }, (_, i) => i + 1))
  })

  test('handles empty string', async ({ assert }) => {
    const input = { entityIds: '' }

    await assert.rejects(
      async () => await historyBatchQueryValidator.validate(input),
      'entityIds is required'
    )
  })

  test('handles whitespace-only string', async ({ assert }) => {
    const input = { entityIds: '   ' }

    await assert.rejects(
      async () => await historyBatchQueryValidator.validate(input),
      'entityIds is required'
    )
  })

  test('handles string with only invalid values', async ({ assert }) => {
    const input = { entityIds: '-1,-2,-3' }

    await assert.rejects(
      async () => await historyBatchQueryValidator.validate(input),
      'No valid entity IDs provided. IDs must be positive integers.'
    )
  })

  test('handles string with only zeros', async ({ assert }) => {
    const input = { entityIds: '0,0,0' }

    await assert.rejects(
      async () => await historyBatchQueryValidator.validate(input),
      'No valid entity IDs provided. IDs must be positive integers.'
    )
  })

  test('handles string with only commas', async ({ assert }) => {
    const input = { entityIds: ',,,' }

    await assert.rejects(
      async () => await historyBatchQueryValidator.validate(input),
      'No valid entity IDs provided. IDs must be positive integers.'
    )
  })

  test('filters scientific notation', async ({ assert }) => {
    const input = { entityIds: '1e5,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    // Scientific notation will be filtered because trimmed !== String(num)
    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('filters hexadecimal numbers', async ({ assert }) => {
    const input = { entityIds: '0x10,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    // Hexadecimal will be parsed by parseInt but filtered by trimmed !== String(num)
    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('filters infinity', async ({ assert }) => {
    const input = { entityIds: 'Infinity,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [2, 3])
  })

  test('handles mixed valid and invalid values', async ({ assert }) => {
    const input = { entityIds: '-1,1,abc,2.5,2,0,3,999999999999' }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
  })

  test('preserves order of valid IDs (after deduplication)', async ({ assert }) => {
    const input = { entityIds: '5,3,1,4,2,3' }
    const result = await historyBatchQueryValidator.validate(input)

    // After deduplication, order should be preserved (first occurrence)
    assert.deepEqual(result.entityIds, [5, 3, 1, 4, 2])
  })

  test('validates with other query parameters', async ({ assert }) => {
    const input = {
      entityIds: '1,2,3',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      period: '30d',
    }
    const result = await historyBatchQueryValidator.validate(input)

    assert.deepEqual(result.entityIds, [1, 2, 3])
    assert.equal(result.startDate, '2024-01-01')
    assert.equal(result.endDate, '2024-01-31')
    assert.equal(result.period, '30d')
  })
})
