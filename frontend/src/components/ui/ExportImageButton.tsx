'use client'

import { type RefObject } from 'react'
import { useExportAsImage } from '@/hooks/useExportAsImage'

interface ExportImageButtonProps {
  tableRef: RefObject<HTMLElement | null>
  filename: string
}

export function ExportImageButton({ tableRef, filename }: ExportImageButtonProps) {
  const { exportAsImage, isExporting } = useExportAsImage(tableRef, filename)

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        exportAsImage()
      }}
      disabled={isExporting}
      className="p-1 rounded hover:bg-[var(--bg-hover)] text-(--text-muted) hover:text-(--text-primary) transition-colors disabled:opacity-50"
      title="Exporter en image"
    >
      {isExporting ? (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
    </button>
  )
}
