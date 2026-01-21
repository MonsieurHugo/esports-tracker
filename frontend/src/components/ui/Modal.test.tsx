import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <div>Modal content</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders modal when isOpen is true', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('renders title correctly', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByText('Test Modal')).toBeInTheDocument()
    })

    it('renders children content', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByText('Modal content')).toBeInTheDocument()
    })
  })

  describe('close behavior', () => {
    it('calls onClose when escape key is pressed', () => {
      render(<Modal {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when close button is clicked', () => {
      render(<Modal {...defaultProps} />)
      const closeButton = screen.getByRole('button', { name: 'Fermer' })
      fireEvent.click(closeButton)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when clicking on backdrop', () => {
      render(<Modal {...defaultProps} />)
      // Backdrop is the first element with absolute positioning and bg-black
      const backdrop = document.querySelector('[aria-hidden="true"]')
      expect(backdrop).toBeInTheDocument()
      fireEvent.click(backdrop!)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when clicking on modal content', () => {
      render(<Modal {...defaultProps} />)
      const modalContent = screen.getByText('Modal content')
      fireEvent.click(modalContent)
      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })
  })

  describe('sizes', () => {
    it('applies small size class', () => {
      render(<Modal {...defaultProps} size="sm" />)
      const dialog = screen.getByRole('dialog')
      expect(dialog.className).toContain('max-w-sm')
    })

    it('applies medium size class by default', () => {
      render(<Modal {...defaultProps} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog.className).toContain('max-w-md')
    })

    it('applies large size class', () => {
      render(<Modal {...defaultProps} size="lg" />)
      const dialog = screen.getByRole('dialog')
      expect(dialog.className).toContain('max-w-lg')
    })

    it('applies xl size class', () => {
      render(<Modal {...defaultProps} size="xl" />)
      const dialog = screen.getByRole('dialog')
      expect(dialog.className).toContain('max-w-[95vw]')
    })
  })

  describe('accessibility', () => {
    it('has correct role', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has aria-modal attribute', () => {
      render(<Modal {...defaultProps} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('has aria-labelledby pointing to title', () => {
      render(<Modal {...defaultProps} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
      expect(screen.getByText('Test Modal')).toHaveAttribute('id', 'modal-title')
    })
  })

  describe('header content', () => {
    it('renders headerContent when provided', () => {
      render(
        <Modal {...defaultProps} headerContent={<span>Header Extra</span>} />
      )
      expect(screen.getByText('Header Extra')).toBeInTheDocument()
    })
  })

  describe('body scroll lock', () => {
    it('sets body overflow to hidden when open', () => {
      render(<Modal {...defaultProps} isOpen={true} />)
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('restores body overflow when closed', () => {
      const { rerender } = render(<Modal {...defaultProps} isOpen={true} />)
      expect(document.body.style.overflow).toBe('hidden')

      rerender(<Modal {...defaultProps} isOpen={false} />)
      expect(document.body.style.overflow).toBe('')
    })
  })
})
