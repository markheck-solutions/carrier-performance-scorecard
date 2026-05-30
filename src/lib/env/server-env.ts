import "server-only";

export type AiProviderId = "mock" | "local";

function readTrimmed(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export function readDemoModeFlag(): boolean {
  return readTrimmed("NEXT_PUBLIC_DEMO_MODE") === "true";
}

export function readDatabaseUrlOrThrow(): string {
  const url = readTrimmed("DATABASE_URL");
  if (!url) {
    // Avoid leaking env var names or values.
    throw new Error("Database connection is not configured.");
  }
  return url;
}

export function isDatabaseConfigured(): boolean {
  return readTrimmed("DATABASE_URL").length > 0;
}

export function readAiProviderFromEnv(): AiProviderId {
  if (readDemoModeFlag()) return "mock";
  const raw = readTrimmed("AI_PROVIDER").toLowerCase();
  return raw === "local" ? "local" : "mock";
}

export function readLocalProviderConfigRaw() {
  return {
    baseUrl: readTrimmed("OPENAI_COMPATIBLE_BASE_URL"),
    apiKey: readTrimmed("OPENAI_COMPATIBLE_API_KEY"),
    model: readTrimmed("OPENAI_COMPATIBLE_MODEL"),
  };
}
