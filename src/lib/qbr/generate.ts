import "server-only";

import type { QbrProviderId } from "./public";
import type { QbrSafeContextV1 } from "./context";
import { generateLocalQbrBrief, isLocalProviderNotConfiguredError } from "./local-provider";
import { generateMockQbrBrief } from "./mock-provider";
import { readAiProviderFromEnv } from "@/lib/env/server-env";

function readProviderFromEnv(): QbrProviderId {
  return readAiProviderFromEnv();
}

export async function generateQbrBrief(context: QbrSafeContextV1, params?: { variant?: number | null }) {
  const provider = readProviderFromEnv();

  if (provider === "local") {
    try {
      return await generateLocalQbrBrief(context);
    } catch (err) {
      if (isLocalProviderNotConfiguredError(err)) throw err;
      // Safe fallback: if the local provider returns an unsafe or malformed response, fall back to deterministic mock.
      return generateMockQbrBrief(context, params);
    }
  }

  return generateMockQbrBrief(context, params);
}
