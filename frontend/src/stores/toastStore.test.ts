import { describe, it, expect, beforeEach } from 'vitest'
import { useToastStore } from './toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useToastStore.setState({ toasts: [] })
  })

  it('starts with empty toasts array', () => {
    const { toasts } = useToastStore.getState()
    expect(toasts).toEqual([])
  })

  it('adds a toast with generated id', () => {
    const { addToast } = useToastStore.getState()

    addToast({
      message: 'Test toast',
      type: 'error',
    })

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      message: 'Test toast',
      type: 'error',
      duration: 5000,
    })
    expect(toasts[0].id).toBeTruthy()
  })

  it('adds multiple toasts', () => {
    const { addToast } = useToastStore.getState()

    addToast({ message: 'First', type: 'error' })
    addToast({ message: 'Second', type: 'success' })

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(2)
    expect(toasts[0].message).toBe('First')
    expect(toasts[1].message).toBe('Second')
  })

  it('removes a toast by id', () => {
    const { addToast, removeToast } = useToastStore.getState()

    addToast({ message: 'Test', type: 'error' })
    const { toasts: toastsBefore } = useToastStore.getState()
    const toastId = toastsBefore[0].id

    removeToast(toastId)

    const { toasts: toastsAfter } = useToastStore.getState()
    expect(toastsAfter).toHaveLength(0)
  })

  it('clears all toasts', () => {
    const { addToast, clearAll } = useToastStore.getState()

    addToast({ message: 'First', type: 'error' })
    addToast({ message: 'Second', type: 'success' })
    addToast({ message: 'Third', type: 'info' })

    clearAll()

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(0)
  })

  it('uses custom duration when provided', () => {
    const { addToast } = useToastStore.getState()

    addToast({
      message: 'Custom duration',
      type: 'warning',
      duration: 3000,
    })

    const { toasts } = useToastStore.getState()
    expect(toasts[0].duration).toBe(3000)
  })

  it('uses default duration of 5000ms when not provided', () => {
    const { addToast } = useToastStore.getState()

    addToast({
      message: 'Default duration',
      type: 'info',
    })

    const { toasts } = useToastStore.getState()
    expect(toasts[0].duration).toBe(5000)
  })
})
