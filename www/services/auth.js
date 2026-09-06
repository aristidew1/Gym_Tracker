// services/auth.js — Better Auth client (email/password, Google, magic link)
// Talks directly to the sync server's REST API (no bundler in this project,
// so we don't pull in the better-auth/client SDK — see server/README.md).

import { t } from '../i18n.js';

const API_BASE = 'https://sync.aristidew.com';
const TOKEN_KEY = 'muscu_auth_token';

// The Web OAuth client ID — not a secret (it ships in every Google Sign-In
// app, web or native), unlike GOOGLE_CLIENT_SECRET which stays server-only.
// The @capawesome/capacitor-google-sign-in plugin requires this exact one
// even on Android/iOS: it's used as the server client ID so our backend can
// verify the resulting idToken. Keep in sync with GOOGLE_CLIENT_ID_WEB in
// server/.env.
const GOOGLE_WEB_CLIENT_ID = '250549621804-7skohanlo9bu7s28e50uenfadnu24uj8.apps.googleusercontent.com';

let currentToken = null;
let currentUser = null;
let googleSignInInitialized = false;
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => {
    try { cb({ token: currentToken, user: currentUser }); } catch (error) { console.warn('[Auth] listener failed:', error); }
  });
}

function getNativePlugin(name) {
  try {
    if (window.Capacitor?.isNativePlatform()) return window.Capacitor.Plugins[name] || null;
  } catch (error) {
    console.warn(`[Auth] Could not get native plugin ${name}:`, error);
  }
  return null;
}

async function readStoredToken() {
  const Preferences = getNativePlugin('Preferences');
  if (Preferences) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value || null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

async function writeStoredToken(token) {
  const Preferences = getNativePlugin('Preferences');
  if (Preferences) {
    if (token) await Preferences.set({ key: TOKEN_KEY, value: token });
    else await Preferences.remove({ key: TOKEN_KEY });
    return;
  }
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function setSession(token, user) {
  currentToken = token || null;
  currentUser = user || null;
  await writeStoredToken(currentToken);
  notify();
}

// Better Auth returns raw English messages (e.g. "Invalid email or password")
// via `code`/`message` on the error body — translate the ones our UI needs to
// show, and fall back to the generic error otherwise rather than leaking
// English strings into a French UI. `context: 'sign-in'` disambiguates a 401
// from a stale/expired bearer token (which services/sync.js handles itself
// via error.status, never reading .message) from a genuine bad-credentials
// response on the sign-in endpoint.
function authErrorKey({ code, message, status, context }) {
  const text = (message || '').toLowerCase();
  if (context === 'sign-in' && (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401)) return 'authInvalidCredentials';
  if (context === 'reset-password' && (code === 'INVALID_TOKEN' || text.includes('invalid token'))) return 'authResetInvalid';
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || text.includes('already exist')) return 'authEmailTaken';
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG' || text.includes('password') && text.includes('short')) return 'authPasswordTooShort';
  return 'authError';
}

// Exported for services/sync.js — same bearer-token + credentials plumbing,
// reused rather than duplicated for the /sync endpoint. `context` is a hint
// for authErrorKey() only (e.g. 'sign-in') and never sent to the server.
export async function apiFetch(path, options = {}, { context } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkError) {
    // fetch() itself throws (TypeError) when the network is unreachable —
    // there's no response body to inspect, so map it straight to the key.
    const error = new Error(t('authNetworkError'));
    error.cause = networkError;
    throw error;
  }

  // The bearer plugin mirrors the session token here on every auth response —
  // pick it up so a web OAuth redirect (which never gives us a JSON body with
  // a token) still leaves us with one, same as email/password does.
  const mirroredToken = response.headers.get('set-auth-token');
  if (mirroredToken) currentToken = mirroredToken;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(t(authErrorKey({ code: data?.code, message: data?.message || data?.error, status: response.status, context })));
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

// ============================================
// PUBLIC API
// ============================================

export async function initAuth() {
  // A password-reset link is NOT a sign-in callback, and is deliberately left
  // untouched here: consuming it now would both (a) race the UI, since the
  // event completeFromUrl() dispatches fires before app.js has had a chance to
  // listen for it, and (b) skip the session restore below, making an already
  // signed-in user look signed out just for following a reset link. The params
  // stay in the URL until consumePendingPasswordReset() reads them, whenever
  // the reset screen is ready — order no longer matters.
  const url = new URL(window.location.href);
  const isPasswordReset = url.searchParams.has('reset_token') || url.searchParams.has('reset_error');
  const fromCallback = !isPasswordReset
    && !window.Capacitor?.isNativePlatform()
    && await completeFromUrl(window.location.href);
  if (fromCallback) {
    // Strip the magic-link/OAuth token so a page reload doesn't replay it.
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url);
    return;
  }

  currentToken = await readStoredToken();
  if (!currentToken) {
    notify();
    return;
  }
  try {
    const session = await apiFetch('/api/auth/get-session');
    if (session?.user) await setSession(currentToken, session.user);
    else await setSession(null, null);
  } catch (error) {
    console.warn('[Auth] Session restore failed:', error);
    await setSession(null, null);
  }
}

// Finishes sign-in from a magic-link / web-OAuth redirect that our server's
// /auth/complete route bounced back with a `?token=...` — see server/src/index.js.
// Also used by the native deep-link listener (gymtracker://auth-callback?token=...)
// in app.js's appUrlOpen handler.
//
// A password-reset deep link (gymtracker://auth-callback?reset_token=...),
// bounced through our server's /auth/reset route, arrives through that same
// listener — so this function checks for `reset_token`/`reset_error` FIRST
// and never treats either as a session token (it isn't one; feeding a reset
// token to get-session would fail and sign the user out). When found, it
// dispatches `auth:password-reset-requested` on window with `{ token }` or
// `{ error: 'invalid' }` so the UI can open the reset-password screen, and
// returns true so the caller (here or the native listener) treats the URL as
// consumed, same as a normal sign-in completion.
export async function completeFromUrl(url) {
  const params = new URL(url).searchParams;
  const resetToken = params.get('reset_token');
  const resetError = params.get('reset_error');
  if (resetToken || resetError) {
    window.dispatchEvent(new CustomEvent('auth:password-reset-requested', {
      detail: resetToken ? { token: resetToken } : { error: 'invalid' },
    }));
    return true;
  }

  const token = params.get('token');
  if (!token) return false;
  currentToken = token;
  try {
    const session = await apiFetch('/api/auth/get-session');
    await setSession(token, session?.user || null);
  } catch (error) {
    console.warn('[Auth] Could not complete sign-in from callback URL:', error);
    await setSession(null, null);
  }
  return true;
}

// Pull-based counterpart to the `auth:password-reset-requested` event above,
// for the app's own startup screen-selection logic (independent of
// initAuth()/completeFromUrl() timing — see app.js). Reads `reset_token` /
// `reset_error` directly off the current URL and, like initAuth() does for a
// magic-link `token`, strips them via history.replaceState so a reload
// doesn't reopen the reset-password screen. Returns `{ token }`,
// `{ error: 'invalid' }`, or null when neither param is present.
export function consumePendingPasswordReset() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('reset_token');
  const error = url.searchParams.get('reset_error');
  if (!token && !error) return null;
  url.searchParams.delete('reset_token');
  url.searchParams.delete('reset_error');
  window.history.replaceState({}, '', url);
  return token ? { token } : { error: 'invalid' };
}

export function getToken() {
  return currentToken;
}

export function getCurrentUser() {
  return currentUser;
}

export function onAuthChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function signUpEmail({ email, password, name }) {
  const data = await apiFetch('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name } });
  await setSession(data.token || currentToken, data.user);
  return data.user;
}

export async function signInEmail({ email, password }) {
  const data = await apiFetch('/api/auth/sign-in/email', { method: 'POST', body: { email, password } }, { context: 'sign-in' });
  await setSession(data.token || currentToken, data.user);
  return data.user;
}

// Better Auth's own callbackURL only carries a session cookie on redirect,
// which our web app's origin (different from the API's) can't read. Routing
// through the API's own /auth/complete lets it read that cookie and hand the
// token back explicitly — see server/src/index.js for the other half of this.
function completionTarget(finalTarget) {
  return `${API_BASE}/auth/complete?target=${encodeURIComponent(finalTarget)}`;
}

// Sibling of completionTarget() for the password-reset flow, routed through
// /auth/reset instead of /auth/complete — see requestPasswordReset() below
// and server/src/index.js for why this needs its own bounce route rather
// than reusing completionTarget()'s.
function resetTarget(finalTarget) {
  return `${API_BASE}/auth/reset?target=${encodeURIComponent(finalTarget)}`;
}

export async function sendMagicLink({ email }) {
  const finalTarget = window.Capacitor?.isNativePlatform() ? 'gymtracker://auth-callback' : window.location.href;
  await apiFetch('/api/auth/sign-in/magic-link', {
    method: 'POST',
    body: { email, callbackURL: completionTarget(finalTarget) },
  });
}

// Like sendMagicLink/signInGoogle, this redirectTo is routed through our own
// server rather than given straight to Better Auth — but through /auth/reset
// (resetTarget()), not completionTarget()'s /auth/complete: that route
// mirrors a *session* cookie, which a password-reset request never creates.
// Better Auth validates redirectTo against trustedOrigins (originCheck), so
// the `gymtracker://auth-callback` custom scheme would be rejected if handed
// to it directly — /auth/reset gives it our own trusted origin instead, then
// bounces to the real target with the token renamed to `reset_token` (see
// server/src/index.js) so completeFromUrl() can't confuse it with a
// magic-link/OAuth session token.
export async function requestPasswordReset({ email }) {
  const finalTarget = window.Capacitor?.isNativePlatform() ? 'gymtracker://auth-callback' : window.location.href;
  await apiFetch('/api/auth/request-password-reset', {
    method: 'POST',
    body: { email, redirectTo: resetTarget(finalTarget) },
  });
}

// Completes the reset: called with the `token` surfaced by
// consumePendingPasswordReset() / the `auth:password-reset-requested` event
// above. `context: 'reset-password'` lets authErrorKey() map Better Auth's
// INVALID_TOKEN (expired/already-used link) to authResetInvalid without
// colliding with other flows that reuse that same code.
export async function resetPassword({ token, newPassword }) {
  await apiFetch('/api/auth/reset-password', { method: 'POST', body: { newPassword, token } }, { context: 'reset-password' });
}

export async function signInGoogle() {
  const native = getNativePlugin('GoogleSignIn');
  if (native) {
    if (!googleSignInInitialized) {
      await native.initialize({ clientId: GOOGLE_WEB_CLIENT_ID });
      googleSignInInitialized = true;
    }
    const result = await native.signIn();
    const idToken = result?.idToken || result?.authentication?.idToken;
    if (!idToken) throw new Error(t('authError'));
    const data = await apiFetch('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'google', idToken: { token: idToken } } });
    await setSession(data.token || currentToken, data.user);
    return data.user;
  }

  // Web: redirect flow. Better Auth sends the browser to Google, then back to
  // our /auth/complete landing route, which hands the token back as a query
  // param; initAuth() picks it up when the page reloads.
  const data = await apiFetch('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'google', callbackURL: completionTarget(window.location.href) } });
  if (data?.url) window.location.href = data.url;
  return null;
}

export async function signOut() {
  try {
    await apiFetch('/api/auth/sign-out', { method: 'POST' });
  } catch (error) {
    console.warn('[Auth] Sign-out request failed:', error);
  }
  await setSession(null, null);
}
