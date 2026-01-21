import { useFilterStore } from '@/stores/filterStore'
import { usePeriodStore } from '@/stores/periodStore'
import { useUIStore } from '@/stores/uiStore'

/**
 * Hook to check if all persisted stores have been hydrated from localStorage.
 * Use this to prevent data fetching before store hydration is complete,
 * which can cause race conditions and cancelled requests.
 */
export function useStoresHydrated(): boolean {
  const filterHydrated = useFilterStore((s) => s._hasHydrated)
  const periodHydrated = usePeriodStore((s) => s._hasHydrated)
  const uiHydrated = useUIStore((s) => s._hasHydrated)

  return filterHydrated && periodHydrated && uiHydrated
}
