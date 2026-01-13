import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors rounded-lg',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-(--primary) text-white hover:bg-(--primary-hover)': variant === 'primary',
            'bg-(--card) text-white border border-(--border) hover:bg-(--card-hover)':
              variant === 'secondary',
            'text-(--muted) hover:text-white hover:bg-(--card)': variant === 'ghost',
            'bg-(--danger) text-white hover:opacity-90': variant === 'danger',
          },
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
