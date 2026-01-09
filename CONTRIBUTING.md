# 🤝 Contributing to Esports Tracker

First off, thank you for considering contributing to Esports Tracker! 🎮

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- pnpm (`npm install -g pnpm`)
- [Claude Code](https://www.anthropic.com/claude-code) (recommended)

### Setup

1. **Fork the repository**

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/esports-tracker.git
   cd esports-tracker
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/esports-tracker.git
   ```

4. **Install dependencies**
   ```bash
   ./scripts/setup.sh
   ```

5. **Start development environment**
   ```bash
   docker-compose up -d
   ```

## 🔄 Development Workflow

### Branch Naming Convention

```
feature/   → New features (feature/add-player-search)
fix/       → Bug fixes (fix/player-stats-loading)
docs/      → Documentation (docs/api-endpoints)
refactor/  → Code refactoring (refactor/player-service)
test/      → Adding tests (test/player-controller)
chore/     → Maintenance (chore/update-dependencies)
```

### Workflow

1. **Sync with upstream**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

4. **Run tests locally**
   ```bash
   # Frontend
   cd frontend && pnpm test
   
   # Backend
   cd backend && node ace test
   
   # Worker
   cd worker && pytest
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add player search functionality"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request**

## 📝 Coding Standards

### TypeScript (Frontend & Backend)

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- No `any` types (use `unknown` if needed)

```typescript
// ✅ Good
interface Player {
  id: string;
  name: string;
}

async function fetchPlayer(id: string): Promise<Player> {
  // ...
}

// ❌ Bad
type Player = {
  id: any;
  name: any;
}

async function fetchPlayer(id) {
  // ...
}
```

### Python (Worker)

- Follow PEP 8
- Use type hints
- Use async/await for I/O operations

```python
# ✅ Good
async def fetch_player(player_id: str) -> Player:
    ...

# ❌ Bad
def fetch_player(player_id):
    ...
```

### File Structure

- One component per file
- Group related files in folders
- Use index files for exports

```
components/
└── PlayerCard/
    ├── PlayerCard.tsx
    ├── PlayerCard.test.tsx
    ├── types.ts
    └── index.ts
```

## 💬 Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting (no code change) |
| `refactor` | Code refactoring |
| `test` | Adding tests |
| `chore` | Maintenance |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |

### Examples

```bash
feat(frontend): add player search component
fix(backend): resolve null pointer in stats endpoint
docs(readme): update installation instructions
refactor(worker): simplify riot api service
test(backend): add player controller tests
```

## 🔀 Pull Request Process

1. **Ensure CI passes** - All tests and linting must pass
2. **Update documentation** - If your changes require it
3. **Add tests** - For new features or bug fixes
4. **Request review** - Tag relevant reviewers
5. **Address feedback** - Respond to review comments
6. **Squash commits** - If requested by maintainers

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log or debug statements
- [ ] No commented-out code
- [ ] Branch is up to date with main

## 🐛 Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Environment details

## 💡 Suggesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and include:

- Problem statement
- Proposed solution
- Use cases
- Alternatives considered

## 🤖 Using Claude Code

This project is optimized for Claude Code. Available commands:

```bash
/generate-component PlayerStats   # Generate React component
/generate-api players             # Generate API endpoint
/generate-test path/to/file       # Generate tests
/review staged                    # Review staged changes
/db-migration create users        # Generate migration
```

## ❓ Questions?

Feel free to open a [Discussion](https://github.com/OWNER/esports-tracker/discussions) for:

- General questions
- Ideas and suggestions
- Help with development

---

Thank you for contributing! 🚀
