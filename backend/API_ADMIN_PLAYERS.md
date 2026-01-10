# Admin Players API Endpoints

## Overview
These endpoints manage players and their contracts for the admin panel.

Base URL: `/api/v1/admin`

---

## 1. GET /api/v1/admin/players

Get a paginated list of players with their active contracts and LoL accounts.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 25 | Items per page (max 100) |
| `search` | string | - | Search in pseudo, firstName, lastName |
| `teamId` | number | - | Filter by team ID |

### Example Request

```bash
GET /api/v1/admin/players?page=1&perPage=25&search=faker&teamId=5
```

### Response Structure

```typescript
{
  data: AdminPlayer[]
  teams: AdminTeam[]   // All active teams for dropdown filter
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

interface AdminPlayer {
  playerId: number
  slug: string
  currentPseudo: string
  firstName: string | null
  lastName: string | null
  nationality: string | null
  twitter: string | null
  twitch: string | null
  contract: {
    contractId: number
    teamId: number
    teamName: string
    teamShortName: string
    teamRegion: string | null
    role: string | null
    isStarter: boolean
    startDate: string | null
    endDate: string | null
  } | null
  accounts: {
    puuid: string
    gameName: string | null
    tagLine: string | null
    region: string
  }[]
}

interface AdminTeam {
  teamId: number
  currentName: string
  shortName: string
  region: string | null
}
```

### Example Response

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
    "total": 1,
    "perPage": 25,
    "currentPage": 1,
    "lastPage": 1
  }
}
```

---

## 2. PATCH /api/v1/admin/players/:id

Update player information (excluding slug and accounts).

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Player ID |

### Request Body

All fields are optional. Only provided fields will be updated.

```typescript
{
  currentPseudo?: string
  firstName?: string | null
  lastName?: string | null
  nationality?: string | null  // ISO 3166-1 alpha-2 country code
  twitter?: string | null
  twitch?: string | null
}
```

### Example Request

```bash
PATCH /api/v1/admin/players/1
Content-Type: application/json

{
  "currentPseudo": "Faker",
  "firstName": "Sang-hyeok",
  "lastName": "Lee",
  "nationality": "KR",
  "twitter": "faker"
}
```

### Response

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
    "updatedAt": "2024-01-10T12:00:00.000Z"
  }
}
```

---

## 3. POST /api/v1/admin/players/:id/contract

Create or update a player's contract.

### Behavior

- If player has an active contract with **another team**: ends the old contract (sets `endDate = NOW`) and creates a new one
- If player has an active contract with the **same team**: updates the existing contract
- If player has **no active contract**: creates a new contract

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Player ID |

### Request Body

```typescript
{
  teamId: number          // Required - Team ID
  role?: string | null    // Optional - "top", "jng", "mid", "bot", "sup"
  isStarter: boolean      // Required - Starter or substitute
  startDate?: string      // Optional - ISO date string
  endDate?: string        // Optional - ISO date string (null = active)
}
```

### Example Request

```bash
POST /api/v1/admin/players/1/contract
Content-Type: application/json

{
  "teamId": 1,
  "role": "mid",
  "isStarter": true,
  "startDate": "2024-01-01",
  "endDate": null
}
```

### Response (Created)

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
    "createdAt": "2024-01-10T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:00:00.000Z"
  }
}
```

### Response (Updated)

```json
{
  "message": "Contract updated successfully",
  "data": {
    "contractId": 15,
    "playerId": 1,
    "teamId": 1,
    "role": "mid",
    "isStarter": true,
    "startDate": "2024-01-01",
    "endDate": null,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:00:00.000Z"
  }
}
```

---

## 4. DELETE /api/v1/admin/players/:id/contract

End the player's active contract (sets `endDate = NOW`).

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Player ID |

### Example Request

```bash
DELETE /api/v1/admin/players/1/contract
```

### Response (Success)

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
    "endDate": "2024-01-10T12:00:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-10T12:00:00.000Z"
  }
}
```

### Response (No Active Contract)

```json
{
  "message": "No active contract found for this player"
}
```

Status: 404 Not Found

---

## Error Responses

### 404 - Not Found

Player or team not found.

```json
{
  "message": "E_ROW_NOT_FOUND: Row not found"
}
```

### 422 - Validation Error

Invalid request parameters or body.

```json
{
  "errors": [
    {
      "field": "teamId",
      "message": "The teamId field must be defined"
    }
  ]
}
```

---

## Database Schema Reference

### players

| Column | Type | Nullable |
|--------|------|----------|
| player_id | int | No (PK) |
| slug | varchar | No (unique) |
| current_pseudo | varchar | No |
| first_name | varchar | Yes |
| last_name | varchar | Yes |
| nationality | varchar(3) | Yes |
| twitter | varchar | Yes |
| twitch | varchar | Yes |
| created_at | timestamp | No |
| updated_at | timestamp | No |

### player_contracts

| Column | Type | Nullable |
|--------|------|----------|
| contract_id | int | No (PK) |
| player_id | int | No (FK → players) |
| team_id | int | No (FK → teams) |
| role | varchar | Yes |
| is_starter | boolean | No |
| start_date | date | Yes |
| end_date | date | Yes |
| created_at | timestamp | No |
| updated_at | timestamp | No |

**Active contract**: `end_date IS NULL`

### lol_accounts

| Column | Type | Nullable |
|--------|------|----------|
| puuid | varchar | No (PK) |
| player_id | int | No (FK → players) |
| game_name | varchar | Yes |
| tag_line | varchar | Yes |
| region | varchar | No |
| is_primary | boolean | No |
| ... | ... | ... |

---

## Notes

- Only one active contract per player (where `end_date IS NULL`)
- LoL accounts are **read-only** via admin API
- Player `slug` is **immutable**
- `updated_at` is automatically updated on modifications
- Team must exist and be valid before creating a contract
- Search is case-insensitive (uses `ILIKE`)
