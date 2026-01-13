'use client'

import { cn } from '@/lib/utils'
import { createContext, useContext, useState, HTMLAttributes, forwardRef } from 'react'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  defaultValue: string
  onValueChange?: (value: string) => void
}

const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ className, defaultValue, onValueChange, children, ...props }, ref) => {
    const [value, setValue] = useState(defaultValue)

    const handleValueChange = (newValue: string) => {
      setValue(newValue)
      onValueChange?.(newValue)
    }

    return (
      <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
        <div ref={ref} className={cn('', className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)

Tabs.displayName = 'Tabs'

const TabsList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg bg-(--card) p-1',
        className
      )}
      {...props}
    />
  )
)

TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const context = useContext(TabsContext)
    if (!context) throw new Error('TabsTrigger must be used within Tabs')

    const isActive = context.value === value

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5',
          'text-sm font-medium transition-all',
          isActive
            ? 'bg-(--background) text-white shadow-xs'
            : 'text-(--muted) hover:text-white',
          className
        )}
        onClick={() => context.onValueChange(value)}
        {...props}
      />
    )
  }
)

TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const context = useContext(TabsContext)
    if (!context) throw new Error('TabsContent must be used within Tabs')

    if (context.value !== value) return null

    return <div ref={ref} className={cn('mt-4', className)} {...props} />
  }
)

TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
