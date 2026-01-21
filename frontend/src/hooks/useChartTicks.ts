import { useMemo, useState, useEffect, useRef, type RefObject } from 'react'
import {
  calculateNiceTicks,
  calculateXAxisInterval,
  calculateBarWidth,
  calculateBarLabelFontSize,
  type TickStrategy,
  type TickOptions,
} from '@/lib/chartUtils'

type PartialTickOptions = Omit<TickOptions, 'min' | 'max'>

/**
 * Hook to calculate nice ticks for chart Y-axis
 * Automatically extracts min/max from data and computes appropriate tick values
 */
export function useChartTicks<T>(
  data: T[],
  valueExtractor: (item: T) => number | number[] | null,
  options: PartialTickOptions
): { ticks: number[]; domain: [number, number] } {
  // Extract all numeric values from data
  const values = useMemo(() => {
    const extracted: number[] = []
    for (const item of data) {
      const result = valueExtractor(item)
      if (result === null) continue
      if (Array.isArray(result)) {
        for (const v of result) {
          if (v !== null && isFinite(v)) {
            extracted.push(v)
          }
        }
      } else if (isFinite(result)) {
        extracted.push(result)
      }
    }
    return extracted
  }, [data, valueExtractor])

  // Calculate ticks
  const ticks = useMemo(() => {
    if (values.length === 0) {
      return calculateNiceTicks({
        min: 0,
        max: 100,
        ...options,
      })
    }

    const min = Math.min(...values)
    const max = Math.max(...values)

    return calculateNiceTicks({
      min,
      max,
      ...options,
    })
  }, [values, options])

  // Calculate domain from ticks
  const domain = useMemo<[number, number]>(() => {
    if (ticks.length < 2) return [0, 100]
    return [ticks[0], ticks[ticks.length - 1]]
  }, [ticks])

  return { ticks, domain }
}

/**
 * Hook to get container width for responsive X-axis interval calculation
 * Uses ResizeObserver to track width changes
 */
export function useChartWidth(containerRef: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(300) // Default width
  const observerRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    // Initial measurement
    setWidth(element.clientWidth)

    // Create observer
    observerRef.current = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setWidth(entry.contentRect.width)
      }
    })

    observerRef.current.observe(element)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [containerRef])

  return width
}

/**
 * Combined hook for X-axis interval calculation
 * Returns the interval value to pass to recharts XAxis component
 */
export function useXAxisInterval(
  dataLength: number,
  containerRef: RefObject<HTMLDivElement | null>,
  minLabelSpacing: number = 45
): number {
  const width = useChartWidth(containerRef)

  return useMemo(() => {
    return calculateXAxisInterval(dataLength, width, minLabelSpacing)
  }, [dataLength, width, minLabelSpacing])
}

/**
 * Hook pour calculer la taille de police des labels de barres
 * basée sur la largeur du graphique et le nombre de points de données
 */
export function useBarLabelFontSize(
  containerRef: RefObject<HTMLDivElement | null>,
  dataPointCount: number,
  barCount: number = 1,
  barCategoryGapPercent: number = 5,
  barGap: number = 2
): { fontSize: number; shouldShowLabels: boolean } {
  const width = useChartWidth(containerRef)

  return useMemo(() => {
    const barWidth = calculateBarWidth(
      width,
      dataPointCount,
      barCount,
      barCategoryGapPercent,
      barGap
    )
    const fontSize = calculateBarLabelFontSize(barWidth, barCount)
    return {
      fontSize,
      shouldShowLabels: fontSize > 0
    }
  }, [width, dataPointCount, barCount, barCategoryGapPercent, barGap])
}
