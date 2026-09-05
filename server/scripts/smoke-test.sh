#!/usr/bin/env bash
# M1 verification (Better Auth edition): exercises sign-up/sign-in/sign-out +
# the empty /sync round trip against a running server.
# Usage: BASE_URL=http://localhost:3000 ./smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="password123"

fail() { echo "FAIL: $1"; exit 1; }

json_field() { node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).$1)}catch(e){}})"; }

echo "== health =="
curl -sf "$BASE_URL/health" | grep -q '"ok":true' || fail "health check"

echo "== sign-up =="
SIGNUP=$(curl -sf -X POST "$BASE_URL/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Test\"}")
TOKEN=$(echo "$SIGNUP" | json_field token)
[ -n "$TOKEN" ] || fail "sign-up did not return a token"

echo "== duplicate sign-up is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Test\"}")
[ "$STATUS" = "422" ] || fail "expected 422 on duplicate sign-up, got $STATUS"

echo "== wrong password is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/sign-in/email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpassword\"}")
[ "$STATUS" = "401" ] || fail "expected 401 on wrong password, got $STATUS"

echo "== sign-in =="
SIGNIN=$(curl -sf -X POST "$BASE_URL/api/auth/sign-in/email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$SIGNIN" | json_field token)
[ -n "$TOKEN" ] || fail "sign-in did not return a token"

echo "== sync without token is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/sync" -H 'Content-Type: application/json' -d '{"lastSyncedAt":null,"changes":{}}')
[ "$STATUS" = "401" ] || fail "expected 401 on unauthenticated sync, got $STATUS"

echo "== sync with token =="
SYNC=$(curl -sf -X POST "$BASE_URL/sync" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lastSyncedAt":null,"changes":{}}')
echo "$SYNC" | grep -q '"syncedAt"' || fail "sync response missing syncedAt"

echo "== sign-out =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/sign-out" -H "Authorization: Bearer $TOKEN")
[ "$STATUS" = "200" ] || fail "expected 200 on sign-out, got $STATUS"

echo "== sync after sign-out is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/sync" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lastSyncedAt":null,"changes":{}}')
[ "$STATUS" = "401" ] || fail "expected 401 on sync after sign-out, got $STATUS"

echo "ALL OK"
