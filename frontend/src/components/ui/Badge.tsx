import { cn } from '@/lib/utils'
import { HTMLAttributes, forwardRef } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'outline-solid'
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          {
            'bg-(--primary) text-white': variant === 'default',
            'bg-(--success) text-white': variant === 'success',
            'bg-(--danger) text-white': variant === 'danger',
            'bg-(--warning) text-(--bg-primary)': variant === 'warning',
            'border border-(--border) text-(--muted)': variant === 'outline-solid',
          },
          className
        )}
        {...props}
      />
    )
  }
)

Badge.displayName = 'Badge'

export { Badge }
