Perform a comprehensive code review.

## Arguments
$ARGUMENTS - File path or "staged" for git staged files, or "branch" for current branch diff

## Review Checklist

### 🔒 Security
- [ ] No hardcoded secrets or API keys
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (proper escaping)
- [ ] CORS properly configured
- [ ] Authentication/authorization checks

### 🏗️ Architecture
- [ ] Single Responsibility Principle
- [ ] DRY (Don't Repeat Yourself)
- [ ] Proper separation of concerns
- [ ] Consistent file structure
- [ ] Appropriate use of design patterns

### 📝 Code Quality
- [ ] TypeScript strict mode compliance
- [ ] No `any` types (use `unknown` if needed)
- [ ] Proper error handling
- [ ] Meaningful variable/function names
- [ ] No magic numbers/strings
- [ ] Comments for complex logic

### ⚡ Performance
- [ ] No N+1 queries
- [ ] Proper use of indexes
- [ ] Memoization where appropriate
- [ ] Lazy loading for heavy components
- [ ] Debouncing for frequent operations

### 🧪 Testability
- [ ] Functions are pure when possible
- [ ] Dependencies are injectable
- [ ] Side effects are isolated
- [ ] Test coverage for critical paths

### 🎨 Frontend Specific
- [ ] Accessibility (a11y) compliance
- [ ] Responsive design
- [ ] Loading states handled
- [ ] Error boundaries in place
- [ ] No memory leaks (cleanup in useEffect)

### 🔌 Backend Specific
- [ ] Proper HTTP status codes
- [ ] Request validation
- [ ] Response serialization
- [ ] Rate limiting considered
- [ ] Logging for debugging

## Output Format

```markdown
## Code Review: {filename}

### Summary
{brief description}

### 🔴 Critical Issues
{must fix before merge}

### 🟡 Suggestions
{recommended improvements}

### 🟢 Good Practices
{what's done well}

### Score: X/10
```
