#!/usr/bin/env bash
# Day-1 Azure resources for foundry-land. Prints the .env values at the end.
# Usage: SUFFIX=yw7 bash scripts/azure-day1.sh
set -euo pipefail
RG=rg-foundry-land
LOC=${LOC:-westus}
SUFFIX=${SUFFIX:?set SUFFIX to a short unique string, e.g. yw7}
STORAGE=stfoundryland$SUFFIX
DOCINT=di-foundry-land-$SUFFIX
SEARCH=srch-foundry-land-$SUFFIX
LAW=law-foundry-land
APPI=appi-foundry-land

az group create -n $RG -l $LOC -o none
az storage account create -n $STORAGE -g $RG -l $LOC --sku Standard_LRS --kind StorageV2 \
  --allow-blob-public-access false -o none
# Free tier: one per subscription; analyses the first 2 pages only (our invoices are 1 page)
az cognitiveservices account create -n $DOCINT -g $RG -l $LOC --kind FormRecognizer --sku F0 \
  --custom-domain $DOCINT --yes -o none
az search service create -n $SEARCH -g $RG -l $LOC --sku free -o none
az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC -o none
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n $LAW --query id -o tsv)
az extension add -n application-insights --upgrade -o none
az monitor app-insights component create -a $APPI -g $RG -l $LOC --workspace "$LAW_ID" -o none

echo "# ---- paste into .env ----"
echo "AZURE_STORAGE_CONNECTION_STRING=$(az storage account show-connection-string -n $STORAGE -g $RG -o tsv)"
echo "DOCINT_ENDPOINT=$(az cognitiveservices account show -n $DOCINT -g $RG --query properties.endpoint -o tsv)"
echo "DOCINT_KEY=$(az cognitiveservices account keys list -n $DOCINT -g $RG --query key1 -o tsv)"
echo "SEARCH_ENDPOINT=https://$SEARCH.search.windows.net"
echo "SEARCH_ADMIN_KEY=$(az search admin-key show --service-name $SEARCH -g $RG --query primaryKey -o tsv)"
echo "APPLICATIONINSIGHTS_CONNECTION_STRING=$(az monitor app-insights component show -a $APPI -g $RG --query connectionString -o tsv)"
