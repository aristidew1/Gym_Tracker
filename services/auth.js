// services/auth.js — Better Auth client (email/password, Google, magic link)
// Talks directly to the sync server's REST API (no bundler in this project,
// so we don't pull in the better-auth/client SDK — see server/README.md).

import { t } from '../i18n.js';

// TODO: point this at the real deployed domain before shipping (see
// server/deploy/Caddyfile, which has the same placeholder today).
const API_BASE = 'http://localhost:3000';
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

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // The bearer plugin mirrors the session token here on every auth response —
  // pick it up so a web OAuth redirect (which never gives us a JSON body with
  // a token) still leaves us with one, same as email/password does.
  const mirroredToken = response.headers.get('set-auth-token');
  if (mirroredToken) currentToken = mirroredToken;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || t('authError'));
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
  const data = await apiFetch('/api/auth/sign-in/email', { method: 'POST', body: { email, password } });
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
