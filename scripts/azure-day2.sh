#!/usr/bin/env bash
# Day-2 deployment to Azure, one section at a time (run from the repo root):
#   export AZURE_CONFIG_DIR=~/.azure-personal; set -a; source .env; source .env.azure; set +a
#   bash scripts/azure-day2.sh providers|postgres|image|app|identity|env|eventgrid|budget|deploy
# Secrets come from .env / .env.azure (git-ignored) and go into Container Apps secrets; nothing is printed.
set -euo pipefail
RG=rg-foundry-land
LOC=${LOC:-westus}
SUFFIX=${SUFFIX:-ev1}
APP=foundry-land
STORAGE=stfoundryland$SUFFIX
DOCINT=di-foundry-land-$SUFFIX
SEARCH=srch-foundry-land-$SUFFIX
FOUNDRY=${FOUNDRY_RESOURCE:-ev-foundry-1-resource}
PG=pg-foundry-land-$SUFFIX

case ${1:?section} in
providers)
  for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.EventGrid Microsoft.Logic Microsoft.Consumption; do
    az provider register --namespace $ns --wait -o none && echo "registered $ns"
  done
  az extension add -n containerapp --upgrade -o none
  ;;
postgres)
  # Burstable B1ms is enough for a demo. Public access: Azure services + this laptop (for migrate/seed).
  az postgres flexible-server create -g $RG -n $PG -l $LOC --tier Burstable --sku-name Standard_B1ms \
    --storage-size 32 --version 16 --admin-user fladmin --admin-password "${PG_PASSWORD:?}" --public-access 0.0.0.0 --yes -o none
  az postgres flexible-server db create -g $RG -s $PG -d foundry_land -o none
  MYIP=$(curl -s https://api.ipify.org)
  az postgres flexible-server firewall-rule create -g $RG -n $PG -r laptop --start-ip-address $MYIP --end-ip-address $MYIP -o none
  echo "postgres ready: $PG.postgres.database.azure.com"
  ;;
image)
  # Build here (a trial subscription may not run ACR Tasks cloud builds) for Azure's amd64, push to the registry.
  ACR=$(az acr list -g $RG --query "[0].name" -o tsv)
  TAG=${TAG:-$(git rev-parse --short HEAD)}
  az acr update -n $ACR --admin-enabled true -o none # pull credentials for Container Apps (demo)
  az acr login -n $ACR
  docker buildx build --platform linux/amd64 -t $ACR.azurecr.io/$APP:$TAG --push .
  echo "$ACR.azurecr.io/$APP:$TAG"
  ;;
app)
  ACR=$(az acr list -g $RG --query "[0].name" -o tsv)
  TAG=${TAG:-$(git rev-parse --short HEAD)}
  # First start fails until 'env' sets the configuration. One copy only: the approve lock lives in the process.
  az containerapp create -n $APP -g $RG --environment ${APP}-env --image $ACR.azurecr.io/$APP:$TAG \
    --registry-server $ACR.azurecr.io --ingress external --target-port 3000 \
    --min-replicas 1 --max-replicas 1 --system-assigned -o none
  echo "app created"
  ;;
deploy)
  # New image → new revision (used after code changes and by GitHub Actions)
  ACR=$(az acr list -g $RG --query "[0].name" -o tsv)
  TAG=${TAG:-$(git rev-parse --short HEAD)}
  az containerapp update -n $APP -g $RG --image $ACR.azurecr.io/$APP:$TAG -o none
  echo "deployed $TAG"
  ;;
identity)
  PRINCIPAL=$(az containerapp show -n $APP -g $RG --query identity.principalId -o tsv)
  role() { az role assignment create --assignee-object-id $PRINCIPAL --assignee-principal-type ServicePrincipal --role "$1" --scope "$2" -o none && echo "role: $1"; }
  role "Storage Blob Data Contributor" "$(az storage account show -n $STORAGE -g $RG --query id -o tsv)"
  role "Cognitive Services User" "$(az cognitiveservices account show -n $DOCINT -g $RG --query id -o tsv)"
  az search service update -n $SEARCH -g $RG --auth-options aadOrApiKey --aad-auth-failure-mode http401WithBearerChallenge -o none
  role "Search Index Data Reader" "$(az search service show -n $SEARCH -g $RG --query id -o tsv)"
  role "Foundry User" "$(az cognitiveservices account show -n $FOUNDRY -g $RG --query id -o tsv)"
  ;;
env)
  FQDN=$(az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv)
  az containerapp secret set -n $APP -g $RG -o none --secrets \
    database-url="postgres://fladmin:${PG_PASSWORD:?}@$PG.postgres.database.azure.com:5432/foundry_land?sslmode=require" \
    event-secret="$EVENT_SECRET" appi="$APPLICATIONINSIGHTS_CONNECTION_STRING" demo-password="${DEMO_PASSWORD:?}"
  # No keys for Blob, Document Intelligence or Search: the managed identity gets tokens.
  az containerapp update -n $APP -g $RG -o none --set-env-vars \
    DATABASE_URL=secretref:database-url EVENT_SECRET=secretref:event-secret \
    APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appi DEMO_PASSWORD=secretref:demo-password \
    STORAGE_ACCOUNT=$STORAGE DOCINT_ENDPOINT=$DOCINT_ENDPOINT SEARCH_ENDPOINT=$SEARCH_ENDPOINT \
    FOUNDRY_PROJECT_ENDPOINT=$FOUNDRY_PROJECT_ENDPOINT MODEL_DEPLOYMENT=$MODEL_DEPLOYMENT \
    SEARCH_CONNECTION_NAME=$SEARCH_CONNECTION_NAME PUBLIC_URL=https://$FQDN \
    FOUNDRY_DRIFT_ANALYST_AGENTS_URL=${FOUNDRY_DRIFT_ANALYST_AGENTS_URL:-} \
    FOUNDRY_INVESTIGATOR_AGENTS_URL=${FOUNDRY_INVESTIGATOR_AGENTS_URL:-} \
    FOUNDRY_FIX_PROPOSER_AGENTS_URL=${FOUNDRY_FIX_PROPOSER_AGENTS_URL:-}
  echo "https://$FQDN"
  ;;
eventgrid)
  FQDN=$(az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv)
  STORAGE_ID=$(az storage account show -n $STORAGE -g $RG --query id -o tsv)
  az eventgrid system-topic create -g $RG -n evgt-foundry-land -l $LOC \
    --topic-type Microsoft.Storage.StorageAccounts --source "$STORAGE_ID" -o none
  # Only batch.json starts a batch (uploaded after the PDFs). Event Grid validates the endpoint now.
  az eventgrid system-topic event-subscription create -g $RG --system-topic-name evgt-foundry-land -n batch-ready \
    --endpoint "https://$FQDN/events/blob?key=$EVENT_SECRET" --event-delivery-schema eventgridschema \
    --included-event-types Microsoft.Storage.BlobCreated \
    --subject-begins-with /blobServices/default/containers/invoices/ --subject-ends-with /batch.json -o none
  echo "event grid subscription created"
  ;;
budget)
  SUB=$(az account show --query id -o tsv)
  EMAIL=${BUDGET_EMAIL:?set BUDGET_EMAIL}
  az rest --method put -o none \
    --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Consumption/budgets/foundry-land?api-version=2023-05-01" \
    --body "{\"properties\":{\"category\":\"Cost\",\"amount\":20,\"timeGrain\":\"Monthly\",\"timePeriod\":{\"startDate\":\"2026-10-01T00:00:00Z\",\"endDate\":\"2027-03-31T00:00:00Z\"},\"notifications\":{\"at80\":{\"enabled\":true,\"operator\":\"GreaterThan\",\"threshold\":80,\"contactEmails\":[\"$EMAIL\"]},\"at100\":{\"enabled\":true,\"operator\":\"GreaterThan\",\"threshold\":100,\"contactEmails\":[\"$EMAIL\"]}}}}"
  echo "budget: \$20/month on $RG, alerts at 80% and 100%"
  ;;
esac
