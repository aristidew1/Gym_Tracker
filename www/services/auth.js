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
  const fromCallback = !window.Capacitor?.isNativePlatform() && await completeFromUrl(window.location.href);
  if (fromCallback) {
    const url = new URL(window.location.href);
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
// Also used by the native deep-link listener (gymtracker://auth-callback?token=...).
export async function completeFromUrl(url) {
  const token = new URL(url).searchParams.get('token');
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

export async function sendMagicLink({ email }) {
  const finalTarget = window.Capacitor?.isNativePlatform() ? 'gymtracker://auth-callback' : window.location.href;
  await apiFetch('/api/auth/sign-in/magic-link', {
    method: 'POST',
    body: { email, callbackURL: completionTarget(finalTarget) },
  });
}

// Unlike sendMagicLink/signInGoogle, this redirectTo does NOT go through
// completionTarget()/`/auth/complete` — that route mirrors a *session*
// cookie, which a password-reset request never creates. Better Auth appends
// `?token=...` straight to redirectTo for a reset-password page to consume;
// there's no such page in this client yet (M3), so we just point back at the
// app's own origin for now.
export async function requestPasswordReset({ email }) {
  const redirectTo = window.Capacitor?.isNativePlatform() ? 'gymtracker://auth-callback' : window.location.href;
  await apiFetch('/api/auth/request-password-reset', {
    method: 'POST',
    body: { email, redirectTo },
  });
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
