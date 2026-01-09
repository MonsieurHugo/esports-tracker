Generate tests for an existing file or component.

## Arguments
$ARGUMENTS - Path to the file to test (e.g., "frontend/src/components/PlayerCard/PlayerCard.tsx")

## Instructions

1. Analyze the provided file
2. Identify all functions, components, and edge cases
3. Generate comprehensive tests

## Test Types by File Location

### Frontend Components (`frontend/src/components/**`)
Use Vitest + Testing Library:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
```

### Frontend Hooks (`frontend/src/hooks/**`)
Use @testing-library/react-hooks:
```typescript
import { renderHook, act } from '@testing-library/react';
```

### Backend Controllers (`backend/app/controllers/**`)
Use Japa functional tests:
```typescript
import { test } from '@japa/runner';
```

### Backend Services (`backend/app/services/**`)
Use Japa unit tests:
```typescript
import { test } from '@japa/runner';
```

### Python Worker (`worker/src/**`)
Use pytest:
```python
import pytest
from unittest.mock import Mock, patch
```

## Test Coverage Goals

- Happy path (normal usage)
- Edge cases (empty data, null values)
- Error handling
- Loading states (for async operations)
- User interactions (clicks, inputs)

## Output Format

Create test file next to the source file with `.test.ts(x)` or `_test.py` suffix.
