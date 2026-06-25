# Login Persistence & Background Session Management - Implementation Guide

## Problem Solved
Previously, users would get logged out when:
- The app was closed or backgrounded
- The phone was turned off
- The browser was reloaded

This prevented drivers from receiving push notifications while logged out, making the app unreliable.

## Solution Overview
Implemented a comprehensive session persistence system that ensures users stay logged in even when the app isn't active, while maintaining security through token refresh mechanisms.

## Changes Made

### 1. **Enhanced Supabase Client** (`src/lib/supabase/client.ts`)
- Added `autoRefreshToken: true` - Automatically refreshes access tokens before expiry
- Added `detectSessionInUrl: true` - Detects session from URL fragments (OAuth flows)
- Implemented dual-storage mechanism:
  - Primary: localStorage (fast)
  - Fallback: sessionStorage (more secure)
- Added storage error handling for quota limits

**Impact**: Session persists across app restarts and page reloads

### 2. **Session Persistence Utility** (`src/lib/session-persistence.ts`)
New utility module with functions:
- `saveSessionToStorage()` - Saves session to localStorage + IndexedDB
- `getSessionFromStorage()` - Retrieves cached session instantly
- `isStoredSessionValid()` - Checks if cached session is still valid
- `clearSessionStorage()` - Clears all session data on logout

**Impact**: Offline access to cached sessions, instant app startup

### 3. **Improved AuthProvider** (`src/components/AuthProvider.tsx`)
Enhanced authentication initialization:
- Step 1: Restores cached session instantly (no network delay)
- Step 2: Verifies/refreshes with Supabase in background
- Step 3: Saves fresh session data
- Graceful fallback to cached session if network is unavailable

**Impact**: Users stay logged in even if network is temporarily down

### 4. **Background Sync Manager** (`src/lib/background-sync.ts`)
New background service that:
- Registers periodic sync every 30 minutes
- Refreshes tokens while app is backgrounded
- Keeps session valid for push notifications

**Functions**:
- `initializeBackgroundSync()` - Registers periodic refresh
- `refreshSessionInBackground()` - Refreshes tokens without UI interaction
- `isSessionValid()` - Checks token expiry
- `ensureValidSession()` - Auto-refresh if needed

**Impact**: Drivers receive notifications even when app is closed

### 5. **Background Sync Hook** (`src/hooks/useBackgroundSync.ts`)
React hook to initialize background sync on app startup.

### 6. **App Initializer Component** (`src/components/AppInitializer.tsx`)
Central component that initializes:
- Background session refresh
- Push notifications
- Page visibility tracking

**Impact**: All background services start automatically

### 7. **Enhanced Push Notifications** (`src/hooks/usePushNotifications.ts`)
Improved notification subscription:
- Waits for session to be available before subscribing
- Retries session lookup (up to 10 times, 500ms intervals)
- Better error handling and logging
- Prevents duplicate subscriptions

**Impact**: Notifications work even if user just logged in

### 8. **Updated Root Layout** (`src/app/layout.tsx`)
Added new components:
- `AppInitializer` - Initializes all background services
- `SupabaseAuthListener` - Ensures auth monitoring

## How It Works

### On App Install/First Launch
1. User logs in with email/password
2. Session is saved to:
   - Supabase's internal storage
   - localStorage
   - IndexedDB (backup)
3. Session access token is stored securely
4. Push notification subscription is registered
5. Background sync is initialized

### On App Restart (While Logged In)
1. App loads
2. `AuthProvider` checks for cached session
3. Restores from localStorage instantly (0ms delay)
4. Meanwhile, verifies/refreshes with Supabase in background
5. User sees authenticated UI immediately
6. Session is re-saved if refreshed

### When App Is Backgrounded
1. Service worker keeps running
2. Every 30 minutes, background sync triggers
3. Session token is automatically refreshed
4. Push notifications are received even if app is closed
5. When user opens app again, session is still valid

### When Phone Is Off
1. Session data remains stored on device
2. When phone is turned on and app opens:
   - Cached session is restored
   - Supabase verifies/refreshes in background
   - User is logged in

### On Network Failure
1. Cached session is used for offline mode
2. App still displays user data
3. When network returns, changes sync

## Security Considerations

✅ **Improved Security**:
- Tokens are auto-refreshed before expiry
- Old tokens are invalidated after refresh
- Storage is cleared on logout
- Session expiry is checked (7-day default)

⚠️ **Mobile Device Security**:
- If phone is stolen and unlocked, attacker could use the app
- Mitigation: Users should logout or use PIN/biometric lock
- For sensitive operations, consider re-auth on device unlock

## Testing Checklist

```
[ ] Install app on mobile PWA
[ ] Login with credentials
[ ] Close app completely
[ ] Reopen app - should be logged in instantly
[ ] Restart phone
[ ] Reopen app - should be logged in
[ ] Leave app backgrounded for 30+ minutes
[ ] Receive push notification
[ ] Return to app - should be logged in
[ ] Logout - should be logged out completely
[ ] Network offline - use cached session
[ ] Network back online - data syncs
```

## Files Modified
- `src/lib/supabase/client.ts` ✓
- `src/components/AuthProvider.tsx` ✓
- `src/hooks/usePushNotifications.ts` ✓
- `src/app/layout.tsx` ✓

## Files Created
- `src/lib/session-persistence.ts` ✓
- `src/lib/background-sync.ts` ✓
- `src/hooks/useBackgroundSync.ts` ✓
- `src/components/AppInitializer.tsx` ✓

## Monitoring & Debugging

All changes include detailed console logging with `[Auth]`, `[Push]`, `[BgSync]`, `[Session]` prefixes:

```javascript
// In browser console:
// See all auth-related activity
console.log("[Auth] Session verified...")
console.log("[Push] Subscribed: endpoint..."
console.log("[BgSync] Token refreshed...")
console.log("[Session] Saved to storage...")
```

## Future Improvements

1. **Biometric Auth** - Add fingerprint/face unlock for reopening app
2. **Deep Linking** - Handle push notifications that open specific screens
3. **Offline Queue** - Queue actions while offline, sync when back online
4. **Session Encryption** - Encrypt session data at rest
5. **Geo-fencing** - Refresh session when entering work location
