import { create } from 'zustand'

export interface ToastItem {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastState {
  toasts: ToastItem[]
  show: (message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void
  dismiss: (id: number) => void
}

let seq = 1

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, opts) => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts, { id, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }] }))
    const duration = opts?.duration ?? 3200
    setTimeout(() => get().dismiss(id), duration)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
