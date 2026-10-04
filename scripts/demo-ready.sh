#!/usr/bin/env bash
# Before a demo: check every Azure part and reset the app to the starting point (mapping v1, no batches).
#   bash scripts/demo-ready.sh          checks + reset (~1 min)
#   bash scripts/demo-ready.sh --full   also runs one live batch end to end (agents, search, email), then resets (~3 min)
# Reads .env and .env.azure (git-ignored); prints no secrets. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."
export AZURE_CONFIG_DIR=~/.azure-personal
FULL=$([ "${1:-}" = "--full" ] && echo 1 || echo 0)
# only the two values this script needs (exporting all of .env.azure would override settings the pnpm scripts read from .env)
val() { grep -m1 "^$1=" "$2" | cut -d= -f2- | sed "s/^['\"]//; s/['\"]$//"; }
PG_PASSWORD=$(val PG_PASSWORD .env.azure) DEMO_PASSWORD=$(val DEMO_PASSWORD .env)
RG=rg-foundry-land APP=foundry-land PG=pg-foundry-land-ev1 LOGIC=la-foundry-land-review
FOUNDRY=ev-foundry-1-resource PROJECT=ev-foundry-1 STORAGE=stfoundrylandev1
ok() { echo "  ✓ $*"; }
warn() { echo "  ! $*"; }
fail() { echo "  ✗ $*"; exit 1; }
api() { curl -sf -u "demo:$DEMO_PASSWORD" "$@"; }

echo "1. Azure login"
[ "$(az account show --query name -o tsv 2>/dev/null)" = "Azure subscription 1" ] || fail "not the personal subscription — run: AZURE_CONFIG_DIR=~/.azure-personal az login"
SUB=$(az account show --query id -o tsv)
URL=https://$(az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null)
ok "personal subscription"

echo "2. Postgres"
state=$(az postgres flexible-server show -g $RG -n $PG --query state -o tsv)
if [ "$state" != "Ready" ]; then
  echo "  … server is $state, starting it (a few minutes)"
  az postgres flexible-server start -g $RG -n $PG -o none
fi
ok "server ready"
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g $RG -n $PG -r laptop --start-ip-address $MYIP --end-ip-address $MYIP -o none
ok "firewall allows this laptop"

echo "3. Deployed version"
git fetch -q origin main 2>/dev/null || true
want=$(git rev-parse --short origin/main)
image=$(az containerapp show -n $APP -g $RG --query "properties.template.containers[0].image" -o tsv 2>/dev/null)
[ "${image##*:}" = "$want" ] && ok "running $want (latest main)" || warn "running ${image##*:}, latest main is $want — check GitHub Actions"
[ "$(az containerapp show -n $APP -g $RG --query properties.runningStatus -o tsv 2>/dev/null)" = "Running" ] || fail "Container App is not running"
ok "Container App running"

echo "4. Clinic notices and project docs in AI Search"
pnpm --silent notices | tail -1 | sed 's/^/  ✓ /'
pnpm --silent project-docs | tail -1 | sed 's/^/  ✓ /'

echo "5. Wiring"
sub_state=$(az eventgrid system-topic event-subscription show -g $RG --system-topic-name evgt-foundry-land -n batch-ready --query provisioningState -o tsv 2>/dev/null || echo missing)
[ "$sub_state" = "Succeeded" ] && ok "Event Grid → app subscription" || fail "Event Grid subscription is $sub_state"
[ "$(az resource show -g $RG -n $LOGIC --resource-type Microsoft.Logic/workflows --query properties.state -o tsv)" = "Enabled" ] && ok "review email (Logic App) enabled" || fail "Logic App is disabled — enable it in the portal"
conns=$(az rest --method get --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$FOUNDRY/projects/$PROJECT/connections?api-version=2025-06-01" --query "value[].properties.category" -o tsv)
grep -q CognitiveSearch <<<"$conns" && ok "Foundry → AI Search connection" || fail "Foundry has no AI Search connection"
grep -q AppInsights <<<"$conns" && ok "Foundry tracing → App Insights" || warn "Foundry tracing not connected (agent traces won't show)"

reset() {
  DATABASE_URL="postgres://fladmin:${PG_PASSWORD}@$PG.postgres.database.azure.com:5432/foundry_land?sslmode=require" \
    NODE_NO_WARNINGS=1 pnpm --silent reset-demo >/dev/null
}

if [ "$FULL" = 1 ]; then
  echo "6. Full run: one live batch (about 90 s)"
  reset
  start=$(date -u +%Y-%m-%dT%H:%M:%SZ) t0=$(date +%s)
  id=$(api $(for f in out/batches/live/*.pdf; do printf -- '-F files=@%s ' "$f"; done) "$URL/api/uploads" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
  st=""
  for _ in $(seq 1 80); do
    st=$(api "$URL/api/batches/$id" | python3 -c 'import sys,json; print(json.load(sys.stdin)["batch"]["state"])')
    case $st in AWAITING_REVIEW|ESCALATED|LOADED|CLOSED) break ;; esac
    sleep 3
  done
  [ "$st" = AWAITING_REVIEW ] || fail "live batch ended $st after $(( $(date +%s) - t0 )) s — open $URL/batches/$id to see why"
  ok "live batch waits for review after $(( $(date +%s) - t0 )) s (agents + search worked)"
  sleep 10
  run=$(az rest --method get --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Logic/workflows/$LOGIC/runs?api-version=2019-05-01&\$top=1" --query "value[0].properties.[startTime,status]" -o tsv | tr '\n' ' ')
  [[ "$run" > "$start" && "$run" == *Succeeded* ]] && ok "review email sent (check your inbox)" || warn "no successful email run since $start ($run)"
  chat=$(curl -sf -u "demo:$DEMO_PASSWORD" -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"What happens when an agent fails?"}]}' "$URL/api/chat" \
    | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["sources"]))' || echo 0)
  [ "$chat" -gt 0 ] && ok "project chat answers with $chat verified source(s)" || warn "project chat gave no verified sources"
fi

echo "$([ "$FULL" = 1 ] && echo 7 || echo 6). Reset the demo data"
reset
ok "batches removed, mapping back to v1"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" = 401 ] || fail "page is not password-protected"
[ "$(curl -s -o /dev/null -w '%{http_code}' -u "demo:$DEMO_PASSWORD" "$URL/")" = 200 ] || fail "page does not load with the password"
n=$(api "$URL/api/batches" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d if isinstance(d,list) else d.get("batches",[])))')
[ "$n" = 0 ] || fail "app still shows $n batches"
ok "password on, no batches"

echo
echo "Ready: $URL  (user: demo)"
echo "Before the call: drop out/batches/normal/*.pdf once, so a normal Loaded batch is there."
echo "Live batch to drop during the demo: out/batches/live/*.pdf"
