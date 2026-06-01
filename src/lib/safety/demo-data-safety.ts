export type SafetyFindingKind =
  | "email"
  | "phone"
  | "street_address"
  | "circuit_id"
  | "order_id"
  | "route_id"
  | "pricing_or_contract"
  | "provider_url"
  | "env_var_name"
  | "real_world_carrier_name"
  | "private_gateway_marker";

export type SafetyFinding = {
  kind: SafetyFindingKind;
  message: string;
  sample: string;
};

type PatternRule = {
  kind: SafetyFindingKind;
  message: string;
  regex: RegExp;
};

const RULES: PatternRule[] = [
  {
    kind: "email",
    message: "Email-like string detected",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    kind: "phone",
    message: "Phone-number-like string detected",
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
  },
  {
    kind: "street_address",
    message: "Street-address-like string detected",
    regex:
      /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/i,
  },
  {
    kind: "circuit_id",
    message: "Circuit-ID-like string detected",
    regex: /\b(?:CKT|CIR|CIRCUIT)[-_\s]?\d{4,}\b/i,
  },
  {
    kind: "order_id",
    message: "Order-ID-like string detected",
    regex: /\b(?:ORD|ORDER)[-_\s]?\d{4,}\b/i,
  },
  {
    kind: "route_id",
    message: "Route-ID-like string detected",
    regex: /\b(?:ROUTE|RTE)[-_\s]?[A-Z0-9]{3,}\b/i,
  },
  {
    kind: "pricing_or_contract",
    message: "Pricing or contract term detected",
    regex:
      /\b(?:\$ ?\d|\d+\s?(?:USD|EUR)|price|pricing|rate\s?card|mrc|nrc|msa|sow|master\s+services\s+agreement|contract\s+(?:value|term)|termination\s+fee)\b/i,
  },
  {
    kind: "provider_url",
    message: "URL detected (avoid embedding URLs in demo data)",
    regex: /\bhttps?:\/\/[^\s]+/i,
  },
  {
    kind: "env_var_name",
    message: "Environment-variable-like name detected",
    regex: /\b(?:DATABASE_URL|OPENAI_COMPATIBLE_(?:BASE_URL|API_KEY|MODEL)|AI_PROVIDER|NEXT_PUBLIC_DEMO_MODE)\b/,
  },
  {
    kind: "real_world_carrier_name",
    message: "Real-world carrier name detected",
    regex: /\b(?:verizon|at&t|t-mobile|tmobile|vodafone|telefonica|telstra|comcast|charter|bt\s+group)\b/i,
  },
  {
    kind: "private_gateway_marker",
    message: "Forbidden private-gateway marker detected (configured out-of-band)",
    regex: /\bPRIVATE_GATEWAY_MARKER_[A-Z0-9_]+\b/,
  },
];

export function scanTextForDemoSafety(text: string): SafetyFinding[] {
  const normalized = text.normalize("NFKC");
  const findings: SafetyFinding[] = [];

  for (const rule of RULES) {
    const match = normalized.match(rule.regex);
    if (!match) continue;
    findings.push({
      kind: rule.kind,
      message: rule.message,
      sample: match[0].slice(0, 120),
    });
  }

  return findings;
}

function collectStringsDeep(value: unknown, out: string[]) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStringsDeep(entry, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStringsDeep(v, out);
    }
  }
}

export function scanUnknownForDemoSafety(value: unknown): SafetyFinding[] {
  const strings: string[] = [];
  collectStringsDeep(value, strings);
  return strings.flatMap((s) => scanTextForDemoSafety(s));
}

export function assertDemoSafe(value: unknown) {
  const findings = scanUnknownForDemoSafety(value);
  if (findings.length === 0) return;

  const unique = new Map<string, SafetyFinding>();
  for (const f of findings) unique.set(`${f.kind}:${f.sample}`, f);

  const rendered = Array.from(unique.values())
    .slice(0, 20)
    .map((f) => `- [${f.kind}] ${f.message}: "${f.sample}"`)
    .join("\n");

  throw new Error(`Demo-data safety scan failed with ${unique.size} finding(s).\n${rendered}`);
}
