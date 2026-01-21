'use client'

import dynamic from 'next/dynamic'

const ToastContainer = dynamic(
  () => import('@/components/ui/ToastContainer').then((mod) => mod.ToastContainer),
  { ssr: false }
)

export function ToastContainerWrapper() {
  return <ToastContainer />
}
