#!/usr/bin/env bash
# M2 verification: push a workout, confirm it round-trips through a pull, and
# that last-write-wins + tombstones behave as designed.
# Usage: BASE_URL=http://localhost:3000 ./sync-smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="sync-smoke-$(date +%s)@example.com"
PASSWORD="password123"

fail() { echo "FAIL: $1"; exit 1; }
json_field() { node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).$1)}catch(e){}})"; }

echo "== sign-up =="
SIGNUP=$(curl -sf -X POST "$BASE_URL/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Sync Smoke\"}")
TOKEN=$(echo "$SIGNUP" | json_field token)
[ -n "$TOKEN" ] || fail "sign-up did not return a token"
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

echo "== push a workout (since: null) echoes it back in the same pull =="
PUSH1=$(curl -sf -X POST "$BASE_URL/sync" "${AUTH[@]}" -d '{
  "since": null,
  "changes": { "workouts": [{"id":"smoke-w1","data":{"v":"first"},"updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}], "programs": [] }
}')
echo "$PUSH1" | grep -q '"id":"smoke-w1"' || fail "pushed workout not echoed back in the same response"
SYNCED_AT=$(echo "$PUSH1" | json_field syncedAt)

echo "== a second sync with since=syncedAt returns nothing new =="
PUSH2=$(curl -sf -X POST "$BASE_URL/sync" "${AUTH[@]}" -d "{\"since\":\"$SYNCED_AT\",\"changes\":{\"workouts\":[],\"programs\":[]}}")
echo "$PUSH2" | grep -q '"workouts":\[\]' || fail "expected an empty pull when nothing changed since the cursor"

echo "== a stale push (older updatedAt) is silently dropped =="
PUSH3=$(curl -sf -X POST "$BASE_URL/sync" "${AUTH[@]}" -d '{
  "since": null,
  "changes": { "workouts": [{"id":"smoke-w1","data":{"v":"STALE"},"updatedAt":"2020-01-01T00:00:00.000Z","deletedAt":null}], "programs": [] }
}')
echo "$PUSH3" | grep -q '"v":"first"' || fail "a stale write must not overwrite a newer record"

echo "== a newer push wins =="
PUSH4=$(curl -sf -X POST "$BASE_URL/sync" "${AUTH[@]}" -d '{
  "since": null,
  "changes": { "workouts": [{"id":"smoke-w1","data":{"v":"second"},"updatedAt":"2026-06-01T00:00:00.000Z","deletedAt":null}], "programs": [] }
}')
echo "$PUSH4" | grep -q '"v":"second"' || fail "a genuinely newer write should be applied"

echo "== a tombstone (soft delete) round-trips with deletedAt set =="
PUSH5=$(curl -sf -X POST "$BASE_URL/sync" "${AUTH[@]}" -d '{
  "since": null,
  "changes": { "workouts": [{"id":"smoke-w1","data":{"v":"second"},"updatedAt":"2026-06-02T00:00:00.000Z","deletedAt":"2026-06-02T00:00:00.000Z"}], "programs": [] }
}')
echo "$PUSH5" | grep -q '"deletedAt":"2026-06-02T00:00:00.000Z"' || fail "tombstone was not persisted/returned"

echo "== an unauthenticated push is rejected =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/sync" -H 'Content-Type: application/json' -d '{"since":null,"changes":{}}')
[ "$STATUS" = "401" ] || fail "expected 401 on unauthenticated sync, got $STATUS"

echo "ALL OK"
