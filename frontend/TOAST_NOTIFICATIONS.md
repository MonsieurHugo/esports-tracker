# Toast Notifications Implementation

## Overview

Added a toast notification system to provide user feedback for API errors and other events. The implementation uses Zustand for state management and follows the project's design system with CSS variables.

## Files Created

### 1. `src/components/ui/Toast.tsx`
Toast component that displays individual notifications.

**Features:**
- Auto-dismiss after configurable duration (default: 5s)
- Manual dismiss via close button
- 4 types: error, success, warning, info
- Styled with CSS variables (--negative, --positive, --warning, --accent)
- Accessible with ARIA attributes
- Slide-in animation from right

**Props:**
```typescript
interface ToastProps {
  id: string
  message: string
  type?: 'error' | 'success' | 'info' | 'warning'
  duration?: number
  onClose: (id: string) => void
}
```

### 2. `src/stores/toastStore.ts`
Zustand store for managing toast state.

**API:**
```typescript
interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearAll: () => void
}
```

**Usage:**
```typescript
import { useToastStore } from '@/stores/toastStore'

function Component() {
  const addToast = useToastStore(state => state.addToast)

  const handleError = () => {
    addToast({
      message: 'Une erreur est survenue',
      type: 'error',
      duration: 5000
    })
  }
}
```

### 3. `src/components/ui/ToastContainer.tsx`
Container component that renders all active toasts in bottom-right corner.

**Features:**
- Fixed positioning (bottom-right)
- Stacked vertically with gap
- ARIA region for screen readers
- Pointer events only on toasts

## Integration

### Root Layout
Added `<ToastContainer />` to `src/app/layout.tsx`:

```tsx
<body>
  <main className="flex-1">{children}</main>
  <Footer />
  <ToastContainer />
</body>
```

### Dashboard Error Handling
Updated `src/app/(lol)/lol/LolDashboard.tsx` to show toasts for API errors:

**Errors handled:**
- Failed to load leagues
- Failed to load teams
- Failed to load players
- Failed to load batch data (grinders, gainers, losers)
- Failed to load team history
- Failed to load player history

**Example:**
```typescript
try {
  const res = await api.get('/endpoint')
  setData(res.data)
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') return

  logError('Failed to fetch', error)
  addToast({
    message: error instanceof ApiError
      ? `Erreur lors du chargement (${error.status})`
      : 'Impossible de charger les données',
    type: 'error',
  })
}
```

## Design System Compliance

### CSS Variables Used
```css
/* Backgrounds */
--bg-card: Background for toast
--bg-hover: Hover state for close button

/* Borders */
--border: Base border
--negative: Error border
--positive: Success border
--warning: Warning border
--accent: Info border

/* Text */
--text-primary: Message text
--text-muted: Close button default color
```

### Animation
- Uses Tailwind's `animate-in` utilities
- Slide-in from right: `slide-in-from-right-full`
- Duration: 300ms
- No dependencies on external animation libraries

## Accessibility

### ARIA Attributes
- Toast container: `role="region"` + `aria-label="Notifications"`
- Each toast: `role="alert"` + `aria-live="assertive"`
- Close button: `aria-label="Fermer la notification"`

### Keyboard Support
- Close button is focusable and keyboard accessible
- Auto-dismiss doesn't trap focus

### Screen Reader Support
- Assertive live region announces errors immediately
- Semantic structure with proper roles

## Testing

### Unit Tests
Created comprehensive test suites:

**`Toast.test.tsx`** (9 tests):
- Renders message correctly
- Applies correct styling for each type
- Calls onClose when button clicked
- Auto-dismisses after duration
- Respects duration=0 (no auto-dismiss)
- Proper accessibility attributes

**`toastStore.test.ts`** (7 tests):
- Starts empty
- Adds toast with generated ID
- Adds multiple toasts
- Removes toast by ID
- Clears all toasts
- Custom duration
- Default duration (5000ms)

**Test Results:**
```
✓ src/stores/toastStore.test.ts (7 tests) 4ms
✓ src/components/ui/Toast.test.tsx (9 tests) 373ms

Test Files  2 passed (2)
Tests  16 passed (16)
```

## Performance Considerations

### Optimizations
1. **Pointer events**: Container has `pointer-events-none`, individual toasts have `pointer-events-auto`
2. **Minimal re-renders**: Store changes only affect ToastContainer
3. **No prop drilling**: Direct store access in components
4. **Cleanup timers**: Auto-dismiss timers properly cleaned up

### Bundle Size
- No external dependencies added
- Uses existing Zustand (already in project)
- Pure CSS animations (no JS animation libraries)

## Usage Examples

### Error Toast
```typescript
addToast({
  message: 'Impossible de charger les données',
  type: 'error',
  duration: 5000
})
```

### Success Toast
```typescript
addToast({
  message: 'Données sauvegardées avec succès',
  type: 'success',
  duration: 3000
})
```

### Warning Toast
```typescript
addToast({
  message: 'Certaines données peuvent être obsolètes',
  type: 'warning',
  duration: 7000
})
```

### Info Toast
```typescript
addToast({
  message: 'Mise à jour disponible',
  type: 'info',
  duration: 5000
})
```

### Persistent Toast (No Auto-Dismiss)
```typescript
addToast({
  message: 'Action requise',
  type: 'warning',
  duration: 0 // Won't auto-dismiss
})
```

## Future Enhancements

Possible improvements (not implemented):
1. **Action buttons**: Add buttons to toasts (e.g., "Retry", "Undo")
2. **Toast queue**: Limit max visible toasts, queue overflow
3. **Position options**: Support top-left, top-right, etc.
4. **Sound notifications**: Audio cues for important toasts
5. **Persistence**: Remember dismissed toasts to avoid showing duplicates
6. **Toast groups**: Group similar toasts (e.g., "3 errors occurred")

## Migration Notes

### Before (Silent Failures)
```typescript
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') return
  // Silent fail - UI will show empty data
}
```

### After (With Toast)
```typescript
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') return

  logError('Failed to fetch', error)
  addToast({
    message: 'Impossible de charger les données',
    type: 'error',
  })
}
```

### API Error Messages
The system provides different messages based on error type:

```typescript
addToast({
  message: error instanceof ApiError
    ? `Erreur lors du chargement (${error.status})`
    : 'Impossible de charger les données',
  type: 'error',
})
```

This gives users more context when the error comes from the API (includes HTTP status code).

## Constraints Met

✅ No new dependencies installed
✅ Uses existing CSS variables
✅ Follows project design system (Terminal Dark theme)
✅ Accessible (WCAG compliant)
✅ Mobile-responsive
✅ Performance optimized
✅ Comprehensive tests
✅ TypeScript strict mode
✅ Works with SSR (Next.js)

## File Structure

```
frontend/src/
├── components/ui/
│   ├── Toast.tsx                 # Toast component
│   ├── Toast.test.tsx            # Toast tests
│   └── ToastContainer.tsx        # Toast container
├── stores/
│   ├── toastStore.ts             # Zustand store
│   └── toastStore.test.ts        # Store tests
└── app/
    ├── layout.tsx                # ToastContainer added
    └── (lol)/lol/
        └── LolDashboard.tsx      # Error handling updated
```
