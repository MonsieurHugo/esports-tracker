import { cn } from '@/lib/utils'
import Image from 'next/image'
import { HTMLAttributes, forwardRef } from 'react'

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  fallback?: string
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt = '', size = 'md', fallback, ...props }, ref) => {
    const sizeClasses = {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-12 h-12 text-base',
      xl: 'w-16 h-16 text-lg',
    }

    const sizePx = {
      sm: 32,
      md: 40,
      lg: 48,
      xl: 64,
    }

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-full overflow-hidden bg-(--card) border border-(--border)',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={sizePx[size]}
            height={sizePx[size]}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-medium text-(--muted)">
            {fallback || alt.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    )
  }
)

Avatar.displayName = 'Avatar'

export { Avatar }
