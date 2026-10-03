#!/usr/bin/env bash
# Before a demo: make the Azure app ready and reset it to the starting point (mapping v1, no batches).
#   bash scripts/demo-ready.sh
# Reads .env and .env.azure (git-ignored); prints no secrets. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."
export AZURE_CONFIG_DIR=~/.azure-personal
# only the two values this script needs (exporting all of .env.azure would override settings the pnpm scripts read from .env)
val() { grep -m1 "^$1=" "$2" | cut -d= -f2- | sed "s/^['\"]//; s/['\"]$//"; }
PG_PASSWORD=$(val PG_PASSWORD .env.azure) DEMO_PASSWORD=$(val DEMO_PASSWORD .env)
RG=rg-foundry-land APP=foundry-land PG=pg-foundry-land-ev1 LOGIC=la-foundry-land-review
URL=https://$(az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv)
ok() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; exit 1; }

echo "1. Azure login"
[ "$(az account show --query name -o tsv)" = "Azure subscription 1" ] || fail "not the personal subscription — run: AZURE_CONFIG_DIR=~/.azure-personal az login"
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

echo "3. Reset the demo data"
DATABASE_URL="postgres://fladmin:${PG_PASSWORD}@$PG.postgres.database.azure.com:5432/foundry_land?sslmode=require" \
  NODE_NO_WARNINGS=1 pnpm --silent reset-demo >/dev/null
ok "batches removed, mapping back to v1"

echo "4. Clinic notices in AI Search"
pnpm --silent notices | tail -1 | sed 's/^/  ✓ /'

echo "5. Review email (Logic App)"
[ "$(az resource show -g $RG -n $LOGIC --resource-type Microsoft.Logic/workflows --query properties.state -o tsv)" = "Enabled" ] || fail "Logic App is disabled — enable it in the portal"
ok "enabled"

echo "6. The app"
[ "$(az containerapp show -n $APP -g $RG --query properties.runningStatus -o tsv)" = "Running" ] || fail "Container App is not running"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" = 401 ] || fail "page is not password-protected"
[ "$(curl -s -o /dev/null -w '%{http_code}' -u "demo:$DEMO_PASSWORD" "$URL/")" = 200 ] || fail "page does not load with the password"
n=$(curl -s -u "demo:$DEMO_PASSWORD" "$URL/api/batches" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d if isinstance(d,list) else d.get("batches",[])))')
[ "$n" = 0 ] || fail "app still shows $n batches"
ok "running, password on, no batches"

echo
echo "Ready: $URL  (user: demo)"
echo "Live batch to drop: out/batches/live/*.pdf"
