import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'error' | 'success' | 'info' | 'warning'
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearAll: () => void
}

/**
 * Toast Store - Manages toast notifications
 *
 * Usage:
 * ```tsx
 * import { useToastStore } from '@/stores/toastStore'
 *
 * function Component() {
 *   const addToast = useToastStore(state => state.addToast)
 *
 *   const handleError = () => {
 *     addToast({
 *       message: 'Une erreur est survenue',
 *       type: 'error',
 *       duration: 5000
 *     })
 *   }
 * }
 * ```
 */
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }))
  },

  clearAll: () => {
    set({ toasts: [] })
  },
}))
