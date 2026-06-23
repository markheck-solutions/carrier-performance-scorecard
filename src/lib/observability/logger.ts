import "server-only";

import { redactString, redactUnknown } from "./redaction";

export type ServerLogLevel = "info" | "warn" | "error";
export type ServerLogContext = Record<string, unknown>;

const logRedaction = { maxArrayItems: 20, maxDepth: 4 };

export function redactLogValue(value: unknown, key = ""): unknown {
  return redactUnknown(value, key, 0, logRedaction);
}

export function buildSafeLogEvent(level: ServerLogLevel, event: string, context: ServerLogContext = {}) {
  return {
    level,
    event: redactString(event, { ...logRedaction, maxStringLength: 160 }),
    context: redactLogValue(context) as ServerLogContext,
    timestamp: new Date().toISOString(),
  };
}

export function writeServerLog(level: ServerLogLevel, event: string, context: ServerLogContext = {}): void {
  const line = JSON.stringify(buildSafeLogEvent(level, event, context));
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}
