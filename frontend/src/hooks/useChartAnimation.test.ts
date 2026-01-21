import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChartAnimation } from './useChartAnimation'

describe('useChartAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial render', () => {
    it('should return initial data with opacity 1', () => {
      const data = [{ id: 1, value: 100 }, { id: 2, value: 200 }]
      const { result } = renderHook(() => useChartAnimation(data))

      expect(result.current.opacity).toBe(1)
      expect(result.current.displayData).toEqual(data)
      expect(result.current.animationKey).toBe(0)
    })

    it('should handle empty initial data', () => {
      const { result } = renderHook(() => useChartAnimation([]))

      expect(result.current.opacity).toBe(1)
      expect(result.current.displayData).toEqual([])
      expect(result.current.animationKey).toBe(0)
    })
  })

  describe('data changes', () => {
    it('should not animate on first render', () => {
      const data = [{ id: 1, value: 100 }]
      const { result } = renderHook(() => useChartAnimation(data))

      // No animation should occur on first render
      expect(result.current.opacity).toBe(1)
      expect(result.current.displayData).toEqual(data)
    })

    it('should trigger fade animation when data changes', () => {
      const initialData = [{ id: 1, value: 100 }]
      const newData = [{ id: 1, value: 200 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data: initialData } }
      )

      // First render - no animation
      expect(result.current.opacity).toBe(1)
      expect(result.current.displayData).toEqual(initialData)

      // Change data
      rerender({ data: newData })

      // After debounce (50ms), opacity should be 0 (fade out)
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(result.current.opacity).toBe(0)
      expect(result.current.displayData).toEqual(initialData) // Still showing old data

      // After fade duration (150ms), data should update and opacity should be 1
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(result.current.opacity).toBe(1)
      expect(result.current.displayData).toEqual(newData)
      expect(result.current.animationKey).toBe(1)
    })

    it('should not animate when data has not changed', () => {
      const data = [{ id: 1, value: 100 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data } }
      )

      expect(result.current.animationKey).toBe(0)

      // Rerender with same data (same content)
      rerender({ data: [{ id: 1, value: 100 }] })

      // Advance all timers
      act(() => {
        vi.advanceTimersByTime(250)
      })

      // Animation key should not change
      expect(result.current.animationKey).toBe(0)
      expect(result.current.opacity).toBe(1)
    })

    it('should increment animationKey on each data change', () => {
      const data1 = [{ id: 1 }]
      const data2 = [{ id: 2 }]
      const data3 = [{ id: 3 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data: data1 } }
      )

      expect(result.current.animationKey).toBe(0)

      // First change
      rerender({ data: data2 })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(result.current.animationKey).toBe(1)

      // Second change
      rerender({ data: data3 })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(result.current.animationKey).toBe(2)
    })
  })

  describe('debouncing', () => {
    it('should debounce rapid data changes', () => {
      const data1 = [{ id: 1 }]
      const data2 = [{ id: 2 }]
      const data3 = [{ id: 3 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data: data1 } }
      )

      // Rapid changes
      rerender({ data: data2 })
      act(() => {
        vi.advanceTimersByTime(20)
      })

      rerender({ data: data3 })
      act(() => {
        vi.advanceTimersByTime(20)
      })

      // Only one animation should occur
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.displayData).toEqual(data3)
      expect(result.current.animationKey).toBe(1)
    })
  })

  describe('custom options', () => {
    it('should respect custom fadeDuration', () => {
      const initialData = [{ id: 1 }]
      const newData = [{ id: 2 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data, { fadeDuration: 300 }),
        { initialProps: { data: initialData } }
      )

      rerender({ data: newData })

      // After debounce
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(result.current.opacity).toBe(0)

      // After 150ms (default duration) - should still be fading
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(result.current.opacity).toBe(0) // Still in fade out

      // After full custom duration (300ms)
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(result.current.opacity).toBe(1)
      expect(result.current.displayData).toEqual(newData)
    })

    it('should respect custom debounceDuration', () => {
      const initialData = [{ id: 1 }]
      const newData = [{ id: 2 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data, { debounceDuration: 100 }),
        { initialProps: { data: initialData } }
      )

      rerender({ data: newData })

      // After default debounce (50ms) - should not have started fading yet
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(result.current.opacity).toBe(1)

      // After custom debounce (100ms) - should start fading
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(result.current.opacity).toBe(0)
    })
  })

  describe('safety net', () => {
    it('should reset opacity if stuck at 0', () => {
      const initialData = [{ id: 1 }]
      const newData = [{ id: 2 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data: initialData } }
      )

      rerender({ data: newData })

      // After debounce - opacity is 0
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(result.current.opacity).toBe(0)

      // If for some reason the fade timer doesn't fire,
      // the safety net should kick in after fadeDuration + 100ms
      act(() => {
        vi.advanceTimersByTime(250) // 150 (fade) + 100 (safety margin)
      })

      // Opacity should be restored
      expect(result.current.opacity).toBe(1)
    })
  })

  describe('cleanup', () => {
    it('should clear debounce timer on unmount', () => {
      const initialData = [{ id: 1 }]
      const newData = [{ id: 2 }]

      const { result, rerender, unmount } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data: initialData } }
      )

      // Change data to trigger debounce
      rerender({ data: newData })

      // Unmount before debounce completes
      unmount()

      // Advance timers - should not throw
      act(() => {
        vi.advanceTimersByTime(250)
      })

      // Result should still have initial state
      expect(result.current.displayData).toEqual(initialData)
    })

    it('should not flash on cleanup (opacity stays stable)', () => {
      const initialData = [{ id: 1 }]
      const newData = [{ id: 2 }]

      const { result, rerender, unmount } = renderHook(
        ({ data }) => useChartAnimation(data),
        { initialProps: { data: initialData } }
      )

      // Complete first animation
      rerender({ data: newData })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(result.current.opacity).toBe(1)

      // Unmount should not change opacity
      unmount()
      expect(result.current.opacity).toBe(1)
    })
  })

  describe('with real timers (async)', () => {
    beforeEach(() => {
      vi.useRealTimers()
    })

    it('should complete animation cycle with real timers', async () => {
      const initialData = [{ id: 1, value: 100 }]
      const newData = [{ id: 1, value: 200 }]

      const { result, rerender } = renderHook(
        ({ data }) => useChartAnimation(data, { fadeDuration: 50, debounceDuration: 20 }),
        { initialProps: { data: initialData } }
      )

      expect(result.current.opacity).toBe(1)

      rerender({ data: newData })

      // Wait for animation to complete
      await waitFor(() => {
        expect(result.current.displayData).toEqual(newData)
      }, { timeout: 200 })

      expect(result.current.opacity).toBe(1)
      expect(result.current.animationKey).toBe(1)
    })
  })
})
