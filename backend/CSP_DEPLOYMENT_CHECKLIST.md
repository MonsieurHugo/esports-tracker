# CSP Fix - Deployment Checklist

## Overview

This checklist ensures the nonce-based CSP implementation is properly deployed and verified.

## Pre-Deployment Checks

### 1. Code Review
- [x] Review `backend/app/middleware/security_headers_middleware.ts` changes
- [x] Verify nonce generation uses `crypto.randomBytes(16)`
- [x] Confirm `'unsafe-eval'` is removed from script-src
- [x] Verify `'strict-dynamic'` is added
- [x] Check all required third-party domains are whitelisted

### 2. Testing
- [x] All backend tests pass (`npm run test`)
- [x] Security headers tests pass (14/14)
- [x] CSP nonce uniqueness verified
- [x] CSP does not include unsafe-eval

**Test Results:**
```
functional / Security Headers Middleware
  √ response includes X-Frame-Options header
  √ response includes X-Content-Type-Options header
  √ response includes X-XSS-Protection header
  √ response includes Referrer-Policy header
  √ response includes Permissions-Policy header
  √ response includes Content-Security-Policy header
  √ CSP includes nonce for script-src
  √ CSP includes strict-dynamic for trusted scripts
  √ CSP does not include unsafe-eval
  √ CSP nonce is unique per request
  √ CSP allows required third-party domains
  √ CSP allows LoL asset domains
  √ response includes Cross-Origin-Opener-Policy header
  √ response includes Cross-Origin-Resource-Policy header

PASSED - Tests 14 passed (14)
```

### 3. Documentation
- [x] `backend/CSP_IMPLEMENTATION.md` created
- [x] `CSP_FIX_SUMMARY.md` created
- [x] `CSP_DEPLOYMENT_CHECKLIST.md` created (this file)

## Staging Environment Testing

### 1. Deploy to Staging
```bash
# Build and deploy
cd backend
npm run build

# Start server
npm start
```

### 2. Verify CSP Headers
```bash
# Check CSP header in response
curl -I https://staging.esports-tracker.com/health

# Expected output should include:
# Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-XXXXX' ...
```

### 3. Browser Testing

#### Chrome DevTools
1. Open https://staging.esports-tracker.com
2. Open DevTools (F12) → Network tab
3. Refresh page
4. Click on any request → Headers tab
5. Verify `Content-Security-Policy` header contains:
   - `script-src 'self' 'nonce-[base64]' 'strict-dynamic'`
   - NO `'unsafe-eval'`

#### Console Testing
1. Open DevTools Console
2. Try to inject malicious script:
   ```javascript
   const script = document.createElement('script')
   script.textContent = 'alert("XSS Test")'
   document.body.appendChild(script)
   ```
3. **Expected Result:** Error message like:
   ```
   Refused to execute inline script because it violates the following
   Content Security Policy directive: "script-src 'self' 'nonce-...'".
   ```

#### Test eval() is Blocked
1. Open DevTools Console
2. Try to use eval:
   ```javascript
   eval('console.log("This should fail")')
   ```
3. **Expected Result:** Error:
   ```
   Uncaught EvalError: Refused to evaluate a string as JavaScript
   because 'unsafe-eval' is not an allowed source of script
   ```

### 4. Analytics Verification

#### Microsoft Clarity
- [ ] Open https://staging.esports-tracker.com
- [ ] Open DevTools → Network tab → Filter by "clarity"
- [ ] Verify requests to `https://www.clarity.ms` are successful
- [ ] Check Clarity dashboard for new sessions
- [ ] Verify heatmaps/recordings work

#### Google Analytics (if enabled)
- [ ] Open DevTools → Network tab → Filter by "analytics"
- [ ] Verify requests to `https://www.google-analytics.com` are successful
- [ ] Check GA dashboard for pageviews
- [ ] Verify events are tracked

### 5. Multi-Browser Testing
- [ ] Chrome/Edge (latest) - Full nonce support
- [ ] Firefox (latest) - Full nonce support
- [ ] Safari 15.4+ - Full nonce support
- [ ] Safari < 15.4 (if needed) - Falls back to unsafe-inline

### 6. Functionality Testing
- [ ] Dashboard loads correctly
- [ ] Charts render properly (Recharts)
- [ ] Player leaderboard works
- [ ] Team leaderboard works
- [ ] Search functionality works
- [ ] Theme switching works
- [ ] No console errors

## Production Deployment

### 1. Pre-Production
- [ ] All staging tests passed
- [ ] Analytics verified working
- [ ] No CSP violations in console
- [ ] Performance impact assessed (should be negligible)

### 2. Deployment
```bash
# Backend
cd backend
npm run build
npm start

# Verify health endpoint
curl https://api.esports-tracker.com/health
```

### 3. Post-Deployment Monitoring (First 24 Hours)

#### Immediate Checks (First 5 Minutes)
- [ ] Application loads successfully
- [ ] Check application logs for errors
- [ ] Verify CSP header in production responses
- [ ] Test login/logout (if applicable)
- [ ] Test critical user flows

#### Analytics Check (First Hour)
- [ ] Microsoft Clarity shows new sessions
- [ ] Google Analytics shows pageviews
- [ ] No significant drop in analytics data

#### Browser Console Monitoring
- [ ] Check for CSP violation errors
- [ ] Check for legitimate scripts being blocked
- [ ] Monitor user reports of issues

#### Performance Monitoring
- [ ] Response time baseline (should be unchanged)
- [ ] Server CPU/memory usage (should be unchanged)
- [ ] Error rate monitoring

### 4. Rollback Plan (If Issues Occur)

If analytics stop working or legitimate scripts are blocked:

```bash
# Quick rollback - temporarily add unsafe-inline back
# File: backend/app/middleware/security_headers_middleware.ts
# Line 63 - Change from:
`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ...`
# To:
`script-src 'self' 'unsafe-inline' ...`

# Then restart server
npm restart
```

**Note:** This is a temporary fix. Investigate root cause and re-deploy proper nonce implementation.

## Success Criteria

### Technical
- [x] All automated tests pass
- [ ] CSP header contains nonce
- [ ] CSP does not contain unsafe-eval
- [ ] Nonce is unique per request
- [ ] No console errors on application load

### Functional
- [ ] Application works as expected
- [ ] All user flows complete successfully
- [ ] Analytics continue to function
- [ ] No increase in error rate

### Security
- [ ] XSS injection attempts are blocked
- [ ] eval() is blocked
- [ ] Only scripts with valid nonce execute
- [ ] Third-party scripts load correctly

## Monitoring Recommendations

### Short Term (First Week)
- Monitor browser console for CSP violations
- Check analytics data daily
- Review error logs for CSP-related issues
- Collect user feedback

### Long Term (Ongoing)
- Review CSP monthly
- Update third-party domain whitelist as needed
- Consider implementing CSP report-uri endpoint
- Keep documentation updated

## CSP Reporting (Optional Enhancement)

To get notified of CSP violations in production:

1. Add CSP reporting endpoint:
```typescript
// backend/app/controllers/csp_report_controller.ts
export default class CspReportController {
  async store({ request }: HttpContext) {
    const report = request.body()
    logger.warn('CSP Violation:', report)
    // Store in database or send to monitoring service
  }
}
```

2. Update CSP header:
```typescript
const cspDirectives = [
  // ... existing directives
  "report-uri /api/csp-violations",
]
```

3. Analyze reports to identify:
   - Legitimate scripts being blocked
   - Attempted XSS attacks
   - Browser extensions causing issues

## Questions or Issues?

**Documentation:**
- Technical details: `backend/CSP_IMPLEMENTATION.md`
- Summary: `CSP_FIX_SUMMARY.md`

**Support:**
- Check browser console for specific CSP error messages
- Review application logs for middleware errors
- Test with CSP Evaluator: https://csp-evaluator.withgoogle.com/

## Sign-Off

- [ ] Backend developer reviewed and tested
- [ ] Frontend developer verified functionality
- [ ] Security review completed
- [ ] Analytics team verified tracking
- [ ] Product owner approved for deployment

**Deployment Date:** _________________

**Deployed By:** _________________

**Rollback Performed:** [ ] Yes [ ] No

**Notes:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
