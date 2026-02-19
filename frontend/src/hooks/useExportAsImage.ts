'use client'

import { useCallback, useState, type RefObject } from 'react'
import { toPng } from 'html-to-image'

export function useExportAsImage(ref: RefObject<HTMLElement | null>, filename: string) {
  const [isExporting, setIsExporting] = useState(false)

  const exportAsImage = useCallback(async () => {
    const node = ref.current
    if (!node || isExporting) return

    setIsExporting(true)

    // Save original styles to restore after capture
    const originalMaxHeight = node.style.maxHeight
    const originalOverflow = node.style.overflow

    try {
      // Remove scroll constraints so full content is captured
      node.style.maxHeight = 'none'
      node.style.overflow = 'visible'

      const dataUrl = await toPng(node, {
        backgroundColor: '#07070a',
        pixelRatio: 2,
      })

      const link = document.createElement('a')
      link.download = filename.endsWith('.png') ? filename : `${filename}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error('Failed to export image:', error)
    } finally {
      // Restore original styles
      node.style.maxHeight = originalMaxHeight
      node.style.overflow = originalOverflow
      setIsExporting(false)
    }
  }, [ref, filename, isExporting])

  return { exportAsImage, isExporting }
}
