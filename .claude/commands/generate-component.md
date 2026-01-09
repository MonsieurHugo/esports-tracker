Generate a new React component for the esports-tracker frontend.

## Instructions

1. Ask for the component name if not provided: $ARGUMENTS
2. Create the component in `frontend/src/components/features/` if it's a feature component, or `frontend/src/components/ui/` if it's a UI component
3. Follow this structure:

```
ComponentName/
├── ComponentName.tsx      # Main component
├── ComponentName.test.tsx # Tests
├── index.ts              # Export
└── types.ts              # Types (if complex)
```

4. Use these conventions:
   - TypeScript strict mode
   - Functional components with explicit FC type
   - Props interface named `{ComponentName}Props`
   - 'use client' only if client-side hooks are needed
   - Tailwind CSS for styling (v4 syntax)
   - Export as named export

5. Include basic test with Vitest and Testing Library

## Example Output

```tsx
// PlayerStats/PlayerStats.tsx
'use client';

import { type FC } from 'react';
import type { PlayerStatsProps } from './types';

export const PlayerStats: FC<PlayerStatsProps> = ({ playerId, showDetails = false }) => {
  return (
    <div className="rounded-lg bg-gray-900 p-4">
      {/* Component content */}
    </div>
  );
};
```
