Generate a database migration for AdonisJS.

## Arguments
$ARGUMENTS - Description of the migration (e.g., "create players table" or "add rank column to players")

## Instructions

1. Parse the migration description
2. Determine if it's a CREATE, ALTER, or custom migration
3. Generate the migration file with proper naming

## Migration Naming Convention
`{timestamp}_migration_description.ts`

Example: `1704067200000_create_players_table.ts`

## Template: Create Table

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema';

export default class extends BaseSchema {
  protected tableName = '{table_name}';

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'));
      
      // Add columns based on description
      
      table.timestamp('created_at').notNullable().defaultTo(this.now());
      table.timestamp('updated_at').notNullable().defaultTo(this.now());
    });
  }

  async down() {
    this.schema.dropTable(this.tableName);
  }
}
```

## Template: Alter Table

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema';

export default class extends BaseSchema {
  protected tableName = '{table_name}';

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Add/modify columns
    });
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Revert changes
    });
  }
}
```

## Common Column Types

| Type | AdonisJS | PostgreSQL |
|------|----------|------------|
| UUID | `table.uuid('id')` | `UUID` |
| String | `table.string('name', 255)` | `VARCHAR(255)` |
| Text | `table.text('description')` | `TEXT` |
| Integer | `table.integer('count')` | `INTEGER` |
| BigInt | `table.bigInteger('amount')` | `BIGINT` |
| Boolean | `table.boolean('is_active')` | `BOOLEAN` |
| JSON | `table.json('data')` | `JSONB` |
| Timestamp | `table.timestamp('created_at')` | `TIMESTAMP` |
| Enum | `table.enum('status', ['active', 'inactive'])` | `ENUM` |

## Foreign Keys

```typescript
table.uuid('player_id').references('id').inTable('players').onDelete('CASCADE');
```

## Indexes

```typescript
table.index(['column1', 'column2']);
table.unique(['email']);
```

## Output

Create the migration file in `backend/database/migrations/` and also create/update the corresponding Model in `backend/app/models/`.
