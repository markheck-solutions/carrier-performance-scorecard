import type { ProductType, Region } from "../domain/demo-values";
import type { ScoringComponentId } from "./types";

export const DEFAULT_EVIDENCE_CAP = 3;

export type EvidenceCandidate = {
  evidenceId: string;
  carrierId: string;
  periodSeedKey: string;
  region: Region;
  productType: ProductType;
  dimension: string;
  delayDays: number;
  responsivenessHours: number;
  escalationCount: number;
  openedAtIso: string;
  stage: string;
  issueSignature: string;
  isRepeat: boolean;
};

function parseIsoMs(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function sortStableDesc(a: EvidenceCandidate, b: EvidenceCandidate, aValue: number, bValue: number) {
  if (aValue !== bValue) return bValue - aValue;
  return a.evidenceId.localeCompare(b.evidenceId);
}

function sortStableAsc(a: EvidenceCandidate, b: EvidenceCandidate, aValue: number, bValue: number) {
  if (aValue !== bValue) return aValue - bValue;
  return a.evidenceId.localeCompare(b.evidenceId);
}

export function selectEvidenceIds(params: {
  componentId: ScoringComponentId;
  candidates: readonly EvidenceCandidate[];
  cap?: number;
}) {
  const cap = params.cap ?? DEFAULT_EVIDENCE_CAP;
  const sorted = [...params.candidates].sort((a, b) => {
    switch (params.componentId) {
      case "delay_severity":
        return sortStableDesc(a, b, a.delayDays, b.delayDays);
      case "responsiveness":
        return sortStableDesc(a, b, a.responsivenessHours, b.responsivenessHours);
      case "escalation_volume":
        return sortStableDesc(a, b, a.escalationCount, b.escalationCount);
      case "aging_open_commitments":
        // Oldest first.
        return sortStableAsc(a, b, parseIsoMs(a.openedAtIso), parseIsoMs(b.openedAtIso));
      case "repeat_issue_concentration":
        // Prefer repeats first, then consistent issue signature groupings.
        if (a.isRepeat !== b.isRepeat) return a.isRepeat ? -1 : 1;
        if (a.issueSignature !== b.issueSignature) return a.issueSignature.localeCompare(b.issueSignature);
        return a.evidenceId.localeCompare(b.evidenceId);
      case "commitment_adherence":
        // Prefer delayed items first to make misses explainable.
        if (a.delayDays !== b.delayDays) return b.delayDays - a.delayDays;
        return a.evidenceId.localeCompare(b.evidenceId);
      case "completion_trend":
        // Trend evidence is qualitative; keep deterministic ordering by period then id.
        if (a.periodSeedKey !== b.periodSeedKey) return a.periodSeedKey.localeCompare(b.periodSeedKey);
        return a.evidenceId.localeCompare(b.evidenceId);
    }
  });

  return sorted.slice(0, cap).map((c) => c.evidenceId);
}
