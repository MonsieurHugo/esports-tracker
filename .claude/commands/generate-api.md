Generate a new API endpoint for the AdonisJS backend.

## Instructions

1. Parse the arguments: $ARGUMENTS (format: "resource-name" or "resource-name action")
2. Create files in the backend following AdonisJS 6 conventions

## Files to Generate

### Controller
`backend/app/controllers/{resources}_controller.ts`

```typescript
import type { HttpContext } from '@adonisjs/core/http';
import {Resource} from '#models/{resource}';
import {Create{Resource}Validator, Update{Resource}Validator} from '#validators/{resource}';

export default class {Resources}Controller {
  /**
   * GET /api/{resources}
   */
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1);
    const limit = request.input('limit', 20);
    
    const {resources} = await {Resource}.query()
      .paginate(page, limit);
    
    return response.ok({resources});
  }

  /**
   * GET /api/{resources}/:id
   */
  async show({ params, response }: HttpContext) {
    const {resource} = await {Resource}.findOrFail(params.id);
    return response.ok({resource});
  }

  /**
   * POST /api/{resources}
   */
  async store({ request, response }: HttpContext) {
    const data = await request.validateUsing(Create{Resource}Validator);
    const {resource} = await {Resource}.create(data);
    return response.created({resource});
  }

  /**
   * PUT /api/{resources}/:id
   */
  async update({ params, request, response }: HttpContext) {
    const {resource} = await {Resource}.findOrFail(params.id);
    const data = await request.validateUsing(Update{Resource}Validator);
    {resource}.merge(data);
    await {resource}.save();
    return response.ok({resource});
  }

  /**
   * DELETE /api/{resources}/:id
   */
  async destroy({ params, response }: HttpContext) {
    const {resource} = await {Resource}.findOrFail(params.id);
    await {resource}.delete();
    return response.noContent();
  }
}
```

### Validator
`backend/app/validators/{resource}.ts`

### Model (if doesn't exist)
`backend/app/models/{resource}.ts`

### Migration (if model is new)
`backend/database/migrations/{timestamp}_create_{resources}_table.ts`

### Route Registration
Add to `backend/start/routes.ts`:
```typescript
router.resource('{resources}', '{Resources}Controller').apiOnly();
```

### Test
`backend/tests/functional/{resources}.spec.ts`
