# Admin Players API - Quick Start Guide

## Endpoints Available

```
GET    /api/v1/admin/players                 - List players (paginated)
PATCH  /api/v1/admin/players/:id             - Update player info
POST   /api/v1/admin/players/:id/contract    - Create/update contract
DELETE /api/v1/admin/players/:id/contract    - End active contract
```

---

## Quick Examples

### 1. Get Players List (with pagination and filters)

```bash
# Get first page
curl http://localhost:3333/api/v1/admin/players

# Search for a player
curl http://localhost:3333/api/v1/admin/players?search=faker

# Filter by team
curl http://localhost:3333/api/v1/admin/players?teamId=1

# Pagination
curl http://localhost:3333/api/v1/admin/players?page=2&perPage=50
```

### 2. Update Player Information

```bash
curl -X PATCH http://localhost:3333/api/v1/admin/players/1 \
  -H "Content-Type: application/json" \
  -d '{
    "currentPseudo": "Faker",
    "firstName": "Sang-hyeok",
    "lastName": "Lee",
    "nationality": "KR",
    "twitter": "faker"
  }'
```

### 3. Assign Player to Team (Create Contract)

```bash
curl -X POST http://localhost:3333/api/v1/admin/players/1/contract \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": 1,
    "role": "mid",
    "isStarter": true,
    "startDate": "2024-01-01"
  }'
```

### 4. Update Existing Contract (Same Team)

```bash
# Just change the role or isStarter
curl -X POST http://localhost:3333/api/v1/admin/players/1/contract \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": 1,
    "role": "top",
    "isStarter": false
  }'
```

### 5. Transfer Player to Another Team

```bash
# Old contract automatically ended
curl -X POST http://localhost:3333/api/v1/admin/players/1/contract \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": 5,
    "role": "mid",
    "isStarter": true,
    "startDate": "2024-06-01"
  }'
```

### 6. Remove Player from Team (End Contract)

```bash
curl -X DELETE http://localhost:3333/api/v1/admin/players/1/contract
```

---

## Response Examples

### GET /api/v1/admin/players

```json
{
  "data": [
    {
      "playerId": 1,
      "slug": "faker",
      "currentPseudo": "Faker",
      "firstName": "Sang-hyeok",
      "lastName": "Lee",
      "nationality": "KR",
      "twitter": "faker",
      "twitch": null,
      "contract": {
        "contractId": 10,
        "teamId": 1,
        "teamName": "T1",
        "teamShortName": "T1",
        "teamRegion": "LCK",
        "role": "mid",
        "isStarter": true,
        "startDate": "2023-01-01",
        "endDate": null
      },
      "accounts": [
        {
          "puuid": "xxx",
          "gameName": "Hide on bush",
          "tagLine": "KR1",
          "region": "kr"
        }
      ]
    }
  ],
  "teams": [
    {
      "teamId": 1,
      "currentName": "T1",
      "shortName": "T1",
      "region": "LCK"
    }
  ],
  "meta": {
    "total": 150,
    "perPage": 25,
    "currentPage": 1,
    "lastPage": 6
  }
}
```

### PATCH /api/v1/admin/players/:id

```json
{
  "message": "Player updated successfully",
  "data": {
    "playerId": 1,
    "slug": "faker",
    "currentPseudo": "Faker",
    "firstName": "Sang-hyeok",
    "lastName": "Lee",
    "nationality": "KR",
    "twitter": "faker",
    "twitch": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-10T15:30:00.000Z"
  }
}
```

### POST /api/v1/admin/players/:id/contract

```json
{
  "message": "Contract created successfully",
  "data": {
    "contractId": 15,
    "playerId": 1,
    "teamId": 1,
    "role": "mid",
    "isStarter": true,
    "startDate": "2024-01-01",
    "endDate": null,
    "createdAt": "2024-01-10T15:30:00.000Z",
    "updatedAt": "2024-01-10T15:30:00.000Z"
  }
}
```

### DELETE /api/v1/admin/players/:id/contract

```json
{
  "message": "Contract ended successfully",
  "data": {
    "contractId": 15,
    "playerId": 1,
    "teamId": 1,
    "role": "mid",
    "isStarter": true,
    "startDate": "2024-01-01",
    "endDate": "2024-01-10T15:30:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-10T15:30:00.000Z"
  }
}
```

---

## Common Use Cases

### 1. Signing a New Player
```bash
# Step 1: Update player info
curl -X PATCH http://localhost:3333/api/v1/admin/players/1 \
  -H "Content-Type: application/json" \
  -d '{"currentPseudo": "NewPlayer", "nationality": "FR"}'

# Step 2: Create contract
curl -X POST http://localhost:3333/api/v1/admin/players/1/contract \
  -H "Content-Type: application/json" \
  -d '{"teamId": 5, "role": "mid", "isStarter": true, "startDate": "2024-06-01"}'
```

### 2. Promoting a Substitute to Starter
```bash
curl -X POST http://localhost:3333/api/v1/admin/players/1/contract \
  -H "Content-Type: application/json" \
  -d '{"teamId": 1, "role": "mid", "isStarter": true}'
```

### 3. Trading a Player
```bash
# Simply assign to new team - old contract automatically ends
curl -X POST http://localhost:3333/api/v1/admin/players/1/contract \
  -H "Content-Type: application/json" \
  -d '{"teamId": 10, "role": "mid", "isStarter": true, "startDate": "2024-07-01"}'
```

### 4. Releasing a Player
```bash
curl -X DELETE http://localhost:3333/api/v1/admin/players/1/contract
```

---

## Testing Locally

### Start Backend
```bash
cd backend
npm run dev
# Server runs on http://localhost:3333
```

### Test with curl
```bash
# Health check
curl http://localhost:3333/health

# Get players
curl http://localhost:3333/api/v1/admin/players
```

### Test with Postman/Insomnia
Import base URL: `http://localhost:3333`

Create collection with:
- GET /api/v1/admin/players
- PATCH /api/v1/admin/players/1
- POST /api/v1/admin/players/1/contract
- DELETE /api/v1/admin/players/1/contract

---

## Frontend Integration

The frontend should use these endpoints via the API client:

```typescript
// lib/api.ts
export const adminApi = {
  // Get players list
  getPlayers: (params?: {
    page?: number
    perPage?: number
    search?: string
    teamId?: number
  }) => api.get('/admin/players', { params }),

  // Update player
  updatePlayer: (id: number, data: Partial<Player>) =>
    api.patch(`/admin/players/${id}`, data),

  // Create/update contract
  upsertContract: (id: number, data: ContractData) =>
    api.post(`/admin/players/${id}/contract`, data),

  // End contract
  endContract: (id: number) =>
    api.delete(`/admin/players/${id}/contract`),
}
```

---

## Database Requirements

These tables must exist:
- `players` - Player information
- `player_contracts` - Contracts with teams
- `teams` - Team information
- `lol_accounts` - LoL Riot accounts

Migrations should already be applied. If not:
```bash
cd backend
node ace migration:run
```

---

## Troubleshooting

### Error: "E_ROW_NOT_FOUND"
- Player ID or Team ID doesn't exist
- Check IDs in database

### Error: "No active contract found"
- Trying to delete a non-existent contract
- Player has no active contract (end_date IS NOT NULL)

### Empty accounts array
- Player has no linked LoL accounts yet
- Accounts are managed separately (read-only in this API)

### Pagination not working
- Check `page` and `perPage` parameters
- `perPage` max is 100

---

## Next Steps

1. Add authentication middleware
2. Add authorization (admin role check)
3. Enable VineJS validators for stricter validation
4. Add rate limiting
5. Add audit logging
6. Test with real data

---

## Files to Review

- `backend/app/controllers/admin_controller.ts` - Controller implementation
- `backend/app/validators/admin_validators.ts` - Validation schemas
- `backend/start/routes.ts` - Route definitions
- `backend/API_ADMIN_PLAYERS.md` - Complete API documentation
