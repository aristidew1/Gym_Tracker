#!/usr/bin/env bash
# M1 verification: exercises register/login/logout + the empty /sync round trip
# against a running server. Usage: BASE_URL=http://localhost:3000 ./smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="password123"

fail() { echo "FAIL: $1"; exit 1; }

echo "== health =="
curl -sf "$BASE_URL/health" | grep -q '"ok":true' || fail "health check"

echo "== register =="
REGISTER=$(curl -sf -X POST "$BASE_URL/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$REGISTER" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
[ -n "$TOKEN" ] || fail "register did not return a token"

echo "== duplicate register is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
[ "$STATUS" = "409" ] || fail "expected 409 on duplicate register, got $STATUS"

echo "== wrong password is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpassword\"}")
[ "$STATUS" = "401" ] || fail "expected 401 on wrong password, got $STATUS"

echo "== login =="
LOGIN=$(curl -sf -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

echo "== sync without token is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/sync" -H 'Content-Type: application/json' -d '{"lastSyncedAt":null,"changes":{}}')
[ "$STATUS" = "401" ] || fail "expected 401 on unauthenticated sync, got $STATUS"

echo "== sync with token =="
SYNC=$(curl -sf -X POST "$BASE_URL/sync" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lastSyncedAt":null,"changes":{}}')
echo "$SYNC" | grep -q '"syncedAt"' || fail "sync response missing syncedAt"

echo "== logout =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/logout" -H "Authorization: Bearer $TOKEN")
[ "$STATUS" = "204" ] || fail "expected 204 on logout, got $STATUS"

echo "== sync after logout is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/sync" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lastSyncedAt":null,"changes":{}}')
[ "$STATUS" = "401" ] || fail "expected 401 on sync after logout, got $STATUS"

echo "ALL OK"
