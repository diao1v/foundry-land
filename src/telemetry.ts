import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { trace } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING },
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "foundry-land" }), // name on the Application Map
  });
  // fetch() is not traced by default; Foundry, Document Intelligence and Search all go through it.
  registerInstrumentations({ tracerProvider: trace.getTracerProvider(), instrumentations: [new UndiciInstrumentation()] });
}

export const tracer = trace.getTracer("foundry-land");
