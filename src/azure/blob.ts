import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import type { Config } from "../config";

type Container = "invoices" | "notices";

export function makeBlob(cfg: Pick<Config, "AZURE_STORAGE_CONNECTION_STRING" | "STORAGE_ACCOUNT">) {
  const svc = cfg.AZURE_STORAGE_CONNECTION_STRING
    ? BlobServiceClient.fromConnectionString(cfg.AZURE_STORAGE_CONNECTION_STRING)
    : new BlobServiceClient(`https://${cfg.STORAGE_ACCOUNT}.blob.core.windows.net`, new DefaultAzureCredential());
  const c = (name: Container) => svc.getContainerClient(name);
  return {
    async upload(container: Container, path: string, data: Buffer, contentType: string) {
      await c(container).createIfNotExists();
      await c(container).getBlockBlobClient(path).upload(data, data.length, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    async list(container: Container, prefix: string) {
      const names: string[] = [];
      for await (const b of c(container).listBlobsFlat({ prefix })) names.push(b.name);
      return names;
    },
    download: (container: Container, path: string) => c(container).getBlobClient(path).downloadToBuffer(),
  };
}
export type Blob = ReturnType<typeof makeBlob>;
