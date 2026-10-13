import { describe, expect, it } from 'vitest'
import { evalIndex, lineAccesses, resolveIndex } from './indexing'

describe('evalIndex', () => {
  const ints = { i: 3, j: 2, n: 10, lo: 0, hi: 7 }

  it('evaluates simple index arithmetic', () => {
    expect(evalIndex('i', ints)).toBe(3)
    expect(evalIndex('i - 1', ints)).toBe(2)
    expect(evalIndex('(lo + hi) // 2', ints)).toBe(3)
    expect(evalIndex('n - i * 2', ints)).toBe(4)
    expect(evalIndex('-1', ints)).toBe(-1)
    expect(evalIndex('i % 2', ints)).toBe(1)
  })

  it('refuses anything it cannot evaluate safely', () => {
    expect(evalIndex('len(nums) - 1', ints)).toBeNull()
    expect(evalIndex('k', ints)).toBeNull()
    expect(evalIndex('i // 0', ints)).toBeNull()
    expect(evalIndex('node.val', ints)).toBeNull()
    expect(evalIndex('i +', ints)).toBeNull()
    expect(evalIndex('', ints)).toBeNull()
  })
})

describe('lineAccesses', () => {
  it('finds the written cell and the cells read in a DP recurrence', () => {
    const got = lineAccesses('            dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])', { i: 2, j: 3 })
    expect(got).toEqual([
      { name: 'dp', indices: [2, 3], write: true },
      { name: 'dp', indices: [1, 3], write: false },
      { name: 'dp', indices: [2, 2], write: false },
    ])
  })

  it('treats comparisons as reads, not writes', () => {
    expect(lineAccesses('if nums[mid] == target:', { mid: 4 })).toEqual([{ name: 'nums', indices: [4], write: false }])
    expect(lineAccesses('while dp[i] <= 3:', { i: 1 })).toEqual([{ name: 'dp', indices: [1], write: false }])
  })

  it('handles augmented assignment and strings with brackets or = inside', () => {
    expect(lineAccesses('count[i] += 1', { i: 0 })[0]).toMatchObject({ write: true })
    expect(lineAccesses("label = 'a[i] = b'", { i: 0 })).toEqual([])
    expect(lineAccesses('x = a[i]  # b[i] = 1', { i: 0 })).toEqual([{ name: 'a', indices: [0], write: false }])
  })

  it('skips slices and unknown indices', () => {
    expect(lineAccesses('part = nums[i:j]', { i: 0, j: 2 })).toEqual([])
    expect(lineAccesses('total += grid[r][c]', { r: 1 })).toEqual([])
  })
})

describe('resolveIndex', () => {
  it('maps negative indices from the end and rejects out-of-range ones', () => {
    expect(resolveIndex(-1, 5)).toBe(4)
    expect(resolveIndex(2, 5)).toBe(2)
    expect(resolveIndex(5, 5)).toBeNull()
    expect(resolveIndex(-6, 5)).toBeNull()
  })
})
