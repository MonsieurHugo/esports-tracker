'use client'

import { useCallback, useRef, useState, type RefObject } from 'react'
import { toPng } from 'html-to-image'

function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = node.querySelectorAll('img')
  const promises = Array.from(imgs).map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) return resolve()
        img.onload = () => resolve()
        img.onerror = () => resolve()
      })
  )
  return Promise.all(promises).then(() => {})
}

export function useSocialCardExport(
  canvasRef: RefObject<HTMLDivElement | null>,
  filename: string,
) {
  const [isExporting, setIsExporting] = useState(false)
  const exportingRef = useRef(false)

  const exportAsPng = useCallback(async () => {
    const node = canvasRef.current
    if (!node || exportingRef.current) return

    exportingRef.current = true
    setIsExporting(true)

    try {
      // Wait for all images to settle (load or error)
      await waitForImages(node)

      const opts = {
        pixelRatio: 2,
        backgroundColor: '#07070a',
        skipFonts: true,
        // Skip images that failed to load
        filter: (el: Element) => {
          if (el instanceof HTMLImageElement && el.naturalWidth === 0) {
            return false
          }
          return true
        },
      }

      // First call warms up image caching inside html-to-image
      await toPng(node, opts).catch(() => {})

      const dataUrl = await toPng(node, opts)

      const link = document.createElement('a')
      link.download = `${filename}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error(
        'Failed to export social card:',
        error instanceof Error ? error.message : JSON.stringify(error),
      )
    } finally {
      exportingRef.current = false
      setIsExporting(false)
    }
  }, [canvasRef, filename])

  return { exportAsPng, isExporting }
}
