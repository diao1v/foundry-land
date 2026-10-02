import { DefaultAzureCredential } from "@azure/identity";

let cred: DefaultAzureCredential | undefined;
// Locally: your `az login`. On Container Apps: the managed identity.
export const tokenFor = (scope: string) => async () => (await (cred ??= new DefaultAzureCredential()).getToken(scope)).token;
