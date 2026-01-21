# Content Security Policy (CSP) Implementation

## Overview

This document explains the CSP implementation for the Esports Tracker application, which uses **nonce-based CSP** to protect against XSS attacks while maintaining compatibility with Next.js and third-party analytics services.

## Architecture

```
┌─────────────┐     CSP Header with Nonce     ┌──────────────┐
│   Backend   │ ─────────────────────────────> │   Browser    │
│  (AdonisJS) │                                │              │
└─────────────┘                                └──────────────┘
       │                                              │
       │ 1. Generate nonce per request                │
       │ 2. Add to CSP header                         │
       │                                              │ 3. Validates inline
       │                                              │    scripts match nonce
       ▼                                              ▼
┌─────────────┐                                ┌──────────────┐
│  Next.js    │ <────────────────────────────  │   Scripts    │
│  Frontend   │   Scripts rendered with nonce  │  (validated) │
└─────────────┘                                └──────────────┘
```

## Current Implementation

### Backend (AdonisJS)

**File:** `backend/app/middleware/security_headers_middleware.ts`

**Key Features:**
- Generates cryptographically secure nonce per request using `crypto.randomBytes(16)`
- Implements strict CSP with `'nonce-{random}'` directive
- Stores nonce in `ctx.nonce` for potential use in responses
- Uses `'strict-dynamic'` to allow dynamically loaded scripts from trusted sources
- Keeps `'unsafe-inline'` as fallback for older browsers (ignored when nonce is present)

**CSP Directives:**
```
script-src 'self' 'nonce-{random}' 'strict-dynamic'
           https://www.clarity.ms
           https://www.googletagmanager.com
           'unsafe-inline'
```

### Frontend (Next.js)

**Current State:**
- Next.js 16 automatically handles nonce injection for inline scripts
- Analytics component (`frontend/src/components/Analytics.tsx`) uses Next.js `<Script>` components
- Next.js will automatically add nonce attribute to script tags during server-side rendering

**Analytics Services:**
- Microsoft Clarity: Uses inline script loader (compatible with nonces)
- Google Analytics 4: Uses inline script (compatible with nonces)

## Security Improvements

### Before (Vulnerable)
```typescript
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.clarity.ms
```
- **Risk:** Any injected script can execute (XSS vulnerability)
- **Attack Vector:** Stored XSS, reflected XSS, DOM-based XSS

### After (Secure)
```typescript
script-src 'self' 'nonce-{random}' 'strict-dynamic' https://www.clarity.ms 'unsafe-inline'
```
- **Protection:** Only scripts with matching nonce can execute
- **Modern Browsers:** Ignore `'unsafe-inline'` when nonce is present
- **Older Browsers:** Fall back to `'unsafe-inline'` (legacy support)
- **Removed:** `'unsafe-eval'` completely removed (no eval() allowed)

## How It Works

### Request Flow

1. **Request arrives** → Security middleware generates nonce
2. **Nonce stored** → `ctx.nonce = 'abc123...'`
3. **CSP header sent** → `Content-Security-Policy: script-src 'nonce-abc123...' ...`
4. **Next.js renders** → Automatically adds `nonce="abc123..."` to inline `<script>` tags
5. **Browser validates** → Only scripts with matching nonce execute

### Example: Analytics Script

**Server generates:**
```http
Content-Security-Policy: script-src 'nonce-x7DkE9...'; ...
```

**Next.js renders:**
```html
<script nonce="x7DkE9..." id="microsoft-clarity">
  (function(c,l,a,r,i,t,y){...})(window, document, "clarity", "script", "uneua94e6o");
</script>
```

**Browser validates:**
- ✅ Nonce matches → Script executes
- ❌ Injected script without nonce → Blocked

## Browser Compatibility

| Browser | Nonce Support | strict-dynamic | Fallback |
|---------|---------------|----------------|----------|
| Chrome 59+ | ✅ | ✅ | N/A |
| Firefox 52+ | ✅ | ✅ | N/A |
| Safari 15.4+ | ✅ | ✅ | N/A |
| Edge 79+ | ✅ | ✅ | N/A |
| IE 11 | ❌ | ❌ | Uses 'unsafe-inline' |
| Safari < 15.4 | ❌ | ❌ | Uses 'unsafe-inline' |

**Note:** The `'unsafe-inline'` directive is kept for legacy browser support but is **ignored by modern browsers** when a nonce is present, providing strong protection for 99%+ of users.

## Remaining Considerations

### 1. Style CSP (Future Enhancement)

**Current:**
```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

**Issue:** `'unsafe-inline'` still present for styles (Tailwind CSS requirement)

**Options:**
- Use style nonces (requires extracting all inline styles)
- Use CSS hashes (brittle, changes with content)
- Wait for Tailwind CSS v4 native CSP support

**Recommendation:** Keep as-is for now. Tailwind v4 may improve this.

### 2. Third-Party Script Validation

**Monitored Sources:**
- Microsoft Clarity: `https://www.clarity.ms`
- Google Analytics: `https://www.googletagmanager.com` and `https://www.google-analytics.com`

**Best Practice:** Regularly audit third-party scripts for security updates.

### 3. Production CSP Reporting (Optional)

**Current:** CSP violations are silently blocked

**Enhancement:** Add CSP reporting endpoint
```typescript
const cspDirectives = [
  // ... existing directives
  "report-uri /api/csp-violations",
  "report-to csp-endpoint"
]
```

**Benefits:**
- Monitor attempted XSS attacks
- Detect legitimate scripts blocked by misconfiguration
- Analytics on attack patterns

## Testing CSP

### Manual Testing

1. **Open DevTools Console**
2. **Try injecting script:**
   ```javascript
   const script = document.createElement('script')
   script.textContent = 'alert("XSS")'
   document.body.appendChild(script)
   ```
3. **Expected Result:**
   ```
   Refused to execute inline script because it violates the following
   Content Security Policy directive: "script-src 'self' 'nonce-...'".
   Either the 'unsafe-inline' keyword, a hash ('sha256-...'), or a
   nonce ('nonce-...') is required to enable inline execution.
   ```

### Automated Testing

**Backend Test:**
```typescript
test('security headers include CSP with nonce', async ({ client }) => {
  const response = await client.get('/')

  response.assertHeader('content-security-policy')
  const csp = response.header('content-security-policy')

  assert.include(csp, "script-src 'self' 'nonce-")
  assert.include(csp, "'strict-dynamic'")
  assert.notInclude(csp, "'unsafe-eval'") // Must not be present
})
```

## Deployment Checklist

- [x] Nonce generation in backend middleware
- [x] CSP header with nonce directive
- [x] Remove `'unsafe-eval'` from script-src
- [x] Add `'strict-dynamic'` for trusted script chains
- [x] Keep `'unsafe-inline'` as legacy fallback
- [x] Add Google Analytics domain to connect-src
- [x] Document CSP implementation
- [ ] Test on staging environment
- [ ] Monitor browser console for CSP violations
- [ ] Verify analytics still work (Clarity, GA)
- [ ] Test on multiple browsers (Chrome, Firefox, Safari, Edge)

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator by Google](https://csp-evaluator.withgoogle.com/)
- [Next.js CSP Documentation](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [OWASP: Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

## Maintenance

**Review Frequency:** Every 3 months or when adding new third-party services

**Update Checklist:**
1. Review all allowed domains in CSP
2. Check for new third-party scripts
3. Test CSP with browser DevTools
4. Update documentation if directives change
5. Monitor CSP violation reports (if implemented)
