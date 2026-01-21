import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast } from './Toast'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Toast', () => {
  const defaultProps = {
    id: 'test-toast',
    message: 'Test notification',
    type: 'error' as const,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders toast with message', () => {
    render(<Toast {...defaultProps} />)
    expect(screen.getByText('Test notification')).toBeInTheDocument()
  })

  it('renders error type with correct styling', () => {
    render(<Toast {...defaultProps} type="error" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-[var(--negative)]')
  })

  it('renders success type with correct styling', () => {
    render(<Toast {...defaultProps} type="success" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-[var(--positive)]')
  })

  it('renders warning type with correct styling', () => {
    render(<Toast {...defaultProps} type="warning" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-[var(--warning)]')
  })

  it('renders info type with correct styling', () => {
    render(<Toast {...defaultProps} type="info" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-[var(--accent)]')
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Toast {...defaultProps} onClose={onClose} />)

    const closeButton = screen.getByRole('button', { name: /fermer/i })
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledWith('test-toast')
  })

  it('auto-dismisses after duration', async () => {
    const onClose = vi.fn()
    render(<Toast {...defaultProps} duration={100} onClose={onClose} />)

    await waitFor(
      () => {
        expect(onClose).toHaveBeenCalledWith('test-toast')
      },
      { timeout: 200 }
    )
  })

  it('does not auto-dismiss when duration is 0', async () => {
    const onClose = vi.fn()
    render(<Toast {...defaultProps} duration={0} onClose={onClose} />)

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('has proper accessibility attributes', () => {
    render(<Toast {...defaultProps} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
  })
})
