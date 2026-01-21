import { useState, useEffect, useRef } from 'react'

const DEFAULT_FADE_DURATION = 150
const DEFAULT_DEBOUNCE_DURATION = 50

export interface UseChartAnimationOptions {
  /** Duration of fade out/in animation in ms (default: 150) */
  fadeDuration?: number
  /** Debounce delay before starting animation in ms (default: 50) */
  debounceDuration?: number
}

export interface UseChartAnimationResult<T> {
  /** Current opacity value (0 or 1) */
  opacity: number
  /** Data to display (delayed update for animation) */
  displayData: T[]
  /** Key to force re-render chart elements for animation */
  animationKey: number
}

/**
 * Hook for managing chart data transitions with fade animations.
 *
 * Handles:
 * - Detecting data changes via JSON serialization
 * - Skipping animation on first render
 * - Debouncing rapid changes
 * - Fade out -> update data -> fade in sequence
 * - Safety timeout to restore opacity if stuck at 0
 *
 * @param data - The source data array
 * @param options - Animation configuration
 * @returns Object with opacity, displayData, and animationKey
 */
export function useChartAnimation<T>(
  data: T[],
  options: UseChartAnimationOptions = {}
): UseChartAnimationResult<T> {
  const { fadeDuration = DEFAULT_FADE_DURATION, debounceDuration = DEFAULT_DEBOUNCE_DURATION } = options

  const [displayedData, setDisplayedData] = useState(data)
  const [opacity, setOpacity] = useState(1)
  const [animationKey, setAnimationKey] = useState(0)

  const isFirstRender = useRef(true)
  const prevDataRef = useRef<string>('')
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Serialize data to compare
    const serialized = JSON.stringify(data)

    // Skip if data hasn't actually changed
    if (serialized === prevDataRef.current) {
      return
    }
    prevDataRef.current = serialized

    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      setDisplayedData(data)
      return
    }

    // Clear any pending timers from previous render
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }

    // Small debounce to let rapid changes settle before animating
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      // Fade out
      setOpacity(0)

      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = null
        // Update data after fade out
        setDisplayedData(data)
        setAnimationKey((k) => k + 1)
        // Fade in
        setOpacity(1)
      }, fadeDuration)
    }, debounceDuration)

    return () => {
      // Only clear debounce timer in cleanup
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      // Don't clear fadeTimer - let it complete to restore opacity
      // Don't set opacity here - causes flash
    }
  }, [data, fadeDuration, debounceDuration])

  // Safety net: if opacity is stuck at 0 for too long, reset it
  useEffect(() => {
    if (opacity === 0) {
      const safetyTimer = setTimeout(() => {
        setOpacity(1)
      }, fadeDuration + 100)
      return () => clearTimeout(safetyTimer)
    }
  }, [opacity, fadeDuration])

  return { opacity, displayData: displayedData, animationKey }
}
