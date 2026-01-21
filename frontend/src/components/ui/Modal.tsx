'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  headerContent?: ReactNode
}

export function Modal({ isOpen, onClose, title, children, size = 'md', headerContent }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-[95vw] w-[95vw]',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          'relative w-full bg-(--bg-card) border border-(--border) rounded-xl shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-200',
          size === 'xl' ? 'max-h-[92vh] h-[92vh] overflow-hidden flex flex-col mx-4' : 'mx-4',
          sizeClasses[size]
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-(--border) gap-4">
          <h2 id="modal-title" className="text-lg font-semibold text-(--text-primary) shrink-0">
            {title}
          </h2>
          {headerContent && (
            <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
              {headerContent}
            </div>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover) transition-colors shrink-0"
            aria-label="Fermer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={cn('px-6 py-4', size === 'xl' && 'overflow-hidden flex-1 min-h-0')}>{children}</div>
      </div>
    </div>
  )
}
