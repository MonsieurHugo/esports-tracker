'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SocialCardCanvas } from './SocialCardCanvas'
import { useSocialCardExport } from '@/hooks/useSocialCardExport'
import { CARD_DIMENSIONS } from './types'
import type { SocialCardFormat, SocialCardData } from './types'

interface SocialCardModalProps {
  isOpen: boolean
  onClose: () => void
  data: SocialCardData
}

const FORMAT_OPTIONS: { key: SocialCardFormat; label: string; desc: string }[] = [
  { key: 'twitter', label: 'Twitter / X', desc: '1200 x 1600' },
  { key: 'instagram', label: 'Instagram', desc: '1080 x 1080' },
  { key: 'tiktok', label: 'TikTok', desc: '1080 x 1920' },
]

export function SocialCardModal({ isOpen, onClose, data }: SocialCardModalProps) {
  const [format, setFormat] = useState<SocialCardFormat>('twitter')
  const canvasRef = useRef<HTMLDivElement>(null)

  const filename = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const { exportAsPng, isExporting } = useSocialCardExport(canvasRef, filename)

  const dims = CARD_DIMENSIONS[format]
  // Scale preview to fit modal (cap both width and height)
  const previewMaxWidth = 480
  const previewMaxHeight = 580
  const scale = Math.min(previewMaxWidth / dims.width, previewMaxHeight / dims.height, 1)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Social Card" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Format picker */}
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFormat(opt.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                format === opt.key
                  ? 'bg-[var(--accent)] text-black border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-(--text-secondary) border-[var(--border)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="block">{opt.label}</span>
              <span className="block text-[10px] opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>

        {/* Scaled preview — the inner SocialCardCanvas is the capture target */}
        <div
          style={{
            width: Math.ceil(dims.width * scale),
            height: Math.ceil(dims.height * scale),
            overflow: 'hidden',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: dims.width,
              height: dims.height,
            }}
          >
            <SocialCardCanvas data={data} format={format} ref={canvasRef} />
          </div>
        </div>

        {/* Download button */}
        <button
          onClick={exportAsPng}
          disabled={isExporting}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {isExporting ? 'Export en cours...' : 'Telecharger PNG'}
        </button>
      </div>
    </Modal>
  )
}
