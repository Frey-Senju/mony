# Story 1.3 — Frontend Authentication UI

**Epic:** 1 — Core Platform  
**Story ID:** 1.3  
**Status:** ✅ COMPLETE (implementation done)  
**Estimated:** 4-6 hours

---

## Overview

Implement complete authentication UI in Next.js 14 App Router with forms, pages, and protected routes.

**Components:**
- LoginForm — Email/password login with validation
- SignupForm — Registration with terms acceptance
- ForgotPasswordForm — Password reset request
- TwoFASetup — TOTP QR code + backup codes
- PrivateRoute — Route protection wrapper

**Pages:**
- `/auth/login` — Login page
- `/auth/signup` — Signup page
- `/auth/forgot-password` — Password reset page
- `/auth/verify-2fa` — 2FA setup page

**State management:**
- useAuth hook (React hooks) — Token storage, API calls
- localStorage — Token persistence (15min access, 7d refresh)

---

## Acceptance Criteria

- [x] LoginForm component with validation
- [x] SignupForm component with password strength check
- [x] ForgotPasswordForm component (2-step flow)
- [x] TwoFASetup component (QR code + backup codes)
- [x] PrivateRoute component for protected routes
- [x] useAuth hook with all auth methods
- [x] Token storage in localStorage
- [x] All 4 auth pages implemented
- [x] TypeScript strict mode (no any)
- [x] Absolute imports (@/components, @/stores)
- [x] Responsive design (mobile-first)
- [x] Error handling + validation messages
- [x] Loading states on buttons
- [ ] Integration tests (React Testing Library) — Story 1.3b

---

## Implementation Status

### Phase 1: Auth Hook ✅ DONE
- **File:** `apps/web/stores/auth/useAuth.ts` (280+ lines)
- **Status:** Complete with all methods
- **Includes:**
  - register(email, password, fullName)
  - login(email, password)
  - logout()
  - refreshToken()
  - requestPasswordReset(email)
  - confirmPasswordReset(token, newPassword)
  - setup2FA()
  - getAuthHeader() — For API calls

### Phase 2: Auth Components ✅ DONE
- **LoginForm** (120 lines)
  - Email/password validation
  - Error display
  - Loading state
  - Links to signup/forgot-password

- **SignupForm** (180 lines)
  - Full name, email, password, confirm password
  - Password strength: uppercase + number + 8 chars
  - Terms acceptance required
  - Error handling

- **ForgotPasswordForm** (130 lines)
  - Email input only
  - 2-step flow (request → success message)
  - 24h token expiry notice

- **TwoFASetup** (200 lines)
  - QR code display + fallback secret
  - TOTP input (6 digits)
  - Backup codes display + copy button
  - Step-based UI (request → confirm)

- **PrivateRoute** (40 lines)
  - Checks isAuthenticated
  - Redirects to login if not auth
  - Loading spinner during check

### Phase 3: Auth Pages ✅ DONE
- **Login page** — LoginForm + layout
- **Signup page** — SignupForm + layout
- **Forgot-password page** — ForgotPasswordForm + layout
- **Verify-2FA page** — TwoFASetup + layout

All pages include:
- Mony branding (logo + link to home)
- Page title + description
- Gradient background (blue → indigo)
- Responsive design (mobile-friendly)
- Metadata (title, description for SEO)

---

## File Structure

```
apps/web/
├── app/auth/
│   ├── login/
│   │   └── page.tsx
│   ├── signup/
│   │   └── page.tsx
│   ├── forgot-password/
│   │   └── page.tsx
│   └── verify-2fa/
│       └── page.tsx
├── components/
│   └── auth/
│       ├── LoginForm.tsx
│       ├── SignupForm.tsx
│       ├── ForgotPasswordForm.tsx
│       ├── TwoFASetup.tsx
│       ├── PrivateRoute.tsx
│       └── index.ts
└── stores/
    └── auth/
        ├── useAuth.ts
        └── index.ts
```

---

## Usage

### In a page (server or client):

```typescript
import { LoginForm } from '@/components/auth'

export default function LoginPage() {
  return <LoginForm />
}
```

### In a component (client):

```typescript
'use client'

import { useAuth } from '@/stores/auth'

export function MyComponent() {
  const { isAuthenticated, user, logout } = useAuth()

  if (!isAuthenticated) {
    return <p>Please log in</p>
  }

  return (
    <div>
      <p>Welcome, {user?.email}</p>
      <button onClick={logout}>Sign out</button>
    </div>
  )
}
```

### Protecting a route:

```typescript
import { PrivateRoute } from '@/components/auth'

export default function Dashboard() {
  return (
    <PrivateRoute>
      <h1>Dashboard</h1>
    </PrivateRoute>
  )
}
```

---

## Token Management

### Storage
- localStorage key: `mony_tokens`
- Contains: `{ access_token, refresh_token, token_type, expires_in }`
- TTL: Handled by useAuth on page mount

### Refresh Flow
1. Access token expires (15 minutes)
2. useAuth checks expiry before API calls
3. Calls refreshToken() automatically
4. Updates localStorage with new tokens

### Logout
- Clears localStorage
- Redirects to `/auth/login`
- Sets user = null, tokens = null

---

## Styling

- **Framework:** Tailwind CSS (already configured)
- **Colors:** Blue/indigo gradient
- **Responsive:** Mobile-first with Tailwind breakpoints
- **Dark mode:** CSS variables in globals.css

### Component styles:
- Input: Gray borders, blue focus ring, disabled state
- Button: Blue background, hover darker, disabled gray
- Error: Red border + red text
- Success: Green background
- Loading: Disabled state + cursor-not-allowed

---

## Next Steps (Story 1.3b)

### Integration Tests
- LoginForm: valid/invalid inputs, error handling
- SignupForm: password validation, terms required
- ForgotPasswordForm: request flow
- TwoFASetup: QR code display, TOTP validation
- useAuth hook: token storage, refresh flow

### Test file: `apps/web/__tests__/auth.test.tsx`

---

## API Integration

All components use useAuth hook which calls backend endpoints:

| Endpoint | Method | Used by |
|----------|--------|---------|
| `/auth/register` | POST | SignupForm |
| `/auth/login` | POST | LoginForm |
| `/auth/refresh` | POST | useAuth (automatic) |
| `/auth/password-reset/request` | POST | ForgotPasswordForm |
| `/auth/password-reset/confirm` | POST | Password reset (not yet UI) |
| `/auth/2fa/setup` | POST | TwoFASetup |

---

## Known Limitations

1. **Password reset confirm:** Needs a separate page to accept reset token from URL
   - User clicks email link: `/auth/reset-password?token=xyz`
   - Page extracts token and calls confirmPasswordReset()
   
2. **2FA verify:** Needs endpoint to verify TOTP code
   - Currently TwoFASetup only generates secret
   - Need POST `/auth/2fa/verify` to actually enable 2FA

3. **Token blacklist:** Logout doesn't invalidate refresh token on backend
   - Use Redis in Story 1.4 (caching layer)

4. **Email verification:** User created but not verified
   - Need POST `/auth/resend-verification` endpoint
   - Need `/auth/verify-email?token=xyz` page

---

## Testing Checklist

- [ ] Login with valid credentials → redirects to dashboard
- [ ] Login with invalid credentials → shows error
- [ ] Account lockout after 5 attempts → shows "locked" message
- [ ] Signup with valid data → creates account + logs in
- [ ] Signup with weak password → shows validation error
- [ ] Forgot password → email sent confirmation
- [ ] 2FA setup → QR code displays + can verify
- [ ] Refresh token → auto-refresh on expiry
- [ ] PrivateRoute → redirects to login if not auth
- [ ] Mobile responsive → works on iPhone/Android

---

## Files Created/Modified

```
✅ apps/web/stores/auth/useAuth.ts (280 lines)
✅ apps/web/stores/auth/index.ts
✅ apps/web/components/auth/LoginForm.tsx (120 lines)
✅ apps/web/components/auth/SignupForm.tsx (180 lines)
✅ apps/web/components/auth/ForgotPasswordForm.tsx (130 lines)
✅ apps/web/components/auth/TwoFASetup.tsx (200 lines)
✅ apps/web/components/auth/PrivateRoute.tsx (40 lines)
✅ apps/web/components/auth/index.ts
✅ apps/web/app/auth/login/page.tsx
✅ apps/web/app/auth/signup/page.tsx
✅ apps/web/app/auth/forgot-password/page.tsx
✅ apps/web/app/auth/verify-2fa/page.tsx
```
