// Event Grid schema (not CloudEvents)
export type EGEvent = {
  id: string;
  topic?: string;
  subject: string;
  eventType: string;
  eventTime?: string;
  dataVersion?: string;
  metadataVersion?: string;
  data: { validationCode?: string; api?: string; url?: string };
};

const BATCH_READY = /^\/blobServices\/default\/containers\/invoices\/blobs\/(.+)\/batch\.json$/;

export const batchNameFromEvent = (e: EGEvent) =>
  e.eventType === "Microsoft.Storage.BlobCreated" ? e.subject.match(BATCH_READY)?.[1] : undefined;

// Same shape Event Grid sends; used locally by scripts/upload-batch.ts and by tests
export const blobCreatedEvent = (path: string): EGEvent[] => [
  {
    id: crypto.randomUUID(),
    topic: "local",
    subject: `/blobServices/default/containers/invoices/blobs/${path}`,
    eventType: "Microsoft.Storage.BlobCreated",
    eventTime: new Date().toISOString(),
    dataVersion: "",
    metadataVersion: "1",
    data: { api: "PutBlob", url: `local://invoices/${path}` },
  },
];
