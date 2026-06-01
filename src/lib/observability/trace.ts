import { randomUUID } from "node:crypto";

export type TraceContext = {
  traceId: string;
  requestId: string;
  parentTraceId: string | null;
  sampled: boolean;
  startedAt: string;
};

type HeaderSource = Headers | Record<string, string | null | undefined>;

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const TRACE_ID_PATTERN = /^[a-f0-9]{32}$/;

function newTraceId(): string {
  return randomUUID().replaceAll("-", "");
}

function readHeader(headers: HeaderSource | undefined, name: string): string | null {
  if (!headers) return null;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name);
  }

  const record = headers as Record<string, string | null | undefined>;
  const direct = record[name];
  if (typeof direct === "string") return direct;
  const lower = name.toLowerCase();
  const entry = Object.entries(record).find(([key]) => key.toLowerCase() === lower);
  return typeof entry?.[1] === "string" ? entry[1] : null;
}

export function isSafeRequestId(value: string | null | undefined): value is string {
  return typeof value === "string" && SAFE_REQUEST_ID_PATTERN.test(value.trim());
}

export function parseTraceparent(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.trim().split("-");
  const traceId = parts[1] ?? "";
  return TRACE_ID_PATTERN.test(traceId) ? traceId : null;
}

export function createTraceContext(headers?: HeaderSource, now = new Date()): TraceContext {
  const requestIdHeader = readHeader(headers, "x-request-id");
  const requestId = isSafeRequestId(requestIdHeader) ? requestIdHeader.trim() : randomUUID();
  const parentTraceId = parseTraceparent(readHeader(headers, "traceparent"));
  const traceId = parentTraceId ?? newTraceId();

  return {
    traceId,
    requestId,
    parentTraceId,
    sampled: true,
    startedAt: now.toISOString(),
  };
}

export function traceResponseHeaders(trace: TraceContext): Record<string, string> {
  return {
    "x-request-id": trace.requestId,
    "x-trace-id": trace.traceId,
  };
}

export function summarizeTrace(trace: TraceContext) {
  return {
    traceId: trace.traceId,
    requestId: trace.requestId,
    sampled: trace.sampled,
  };
}
