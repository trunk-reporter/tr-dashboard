import { create } from 'zustand'

export type ToastVariant = 'default' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  show: (message: string, variant?: ToastVariant, duration?: number) => void
  dismiss: (id: string) => void
}

let _idCounter = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show(message, variant = 'default', duration = 4000) {
    const id = String(++_idCounter)
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, duration }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
