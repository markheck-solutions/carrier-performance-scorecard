"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { QbrBriefRequestBody, QbrBriefResponse } from "@/lib/qbr/public";
import type { ScoreFilters } from "@/lib/scoring/types";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; requestKey: string }
  | { status: "ready"; requestKey: string; data: QbrBriefResponse }
  | { status: "error"; requestKey: string; message: string };

function formatScope(filters: Pick<ScoreFilters, "region" | "productType" | "period">) {
  const period = filters.period ? `Period ${filters.period}` : "All periods";
  const region = filters.region ? `Region ${filters.region.toUpperCase()}` : "All regions";
  const product = filters.productType ? `Product ${filters.productType}` : "All products";
  return `${period} • ${region} • ${product}`;
}

function Section(props: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <h4 className="text-sm font-semibold text-white">{props.title}</h4>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-white/75">
        {props.items.map((item, idx) => (
          <li key={`${idx}-${item.slice(0, 20)}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function QbrBriefPanel(props: {
  demoMode: boolean;
  carrier: { id: string; name: string; shortCode: string } | null;
  filters: Pick<ScoreFilters, "region" | "productType" | "period">;
}) {
  const [variant, setVariant] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const requestSeq = useRef(0);

  const scopeLabel = useMemo(() => formatScope(props.filters), [props.filters]);

  const generate = useCallback(async () => {
    if (!props.carrier) return;
    const requestKey = JSON.stringify({ carrierId: props.carrier.id, filters: props.filters, variant });
    const requestId = ++requestSeq.current;
    setState({ status: "loading", requestKey });

    const body: QbrBriefRequestBody = {
      carrierId: props.carrier.id,
      region: props.filters.region ?? null,
      productType: props.filters.productType ?? null,
      period: props.filters.period ?? null,
      variant,
    };

    try {
      const res = await fetch("/api/qbr/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as QbrBriefResponse;
      if (requestId !== requestSeq.current) return;
      if (!res.ok || !payload.ok) {
        const message = !payload.ok ? payload.error.message : "Unable to generate QBR brief right now.";
        setState({ status: "error", requestKey, message });
        return;
      }
      setState({ status: "ready", requestKey, data: payload });
    } catch {
      if (requestId !== requestSeq.current) return;
      setState({ status: "error", requestKey, message: "Unable to generate QBR brief right now." });
    }
  }, [props.carrier, props.filters, variant]);

  const canGenerate = Boolean(props.carrier);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-white/60">QBR brief</div>
          <h3 className="mt-1 text-base font-semibold text-white">Talking points for the selected scope</h3>
          <p className="mt-1 text-sm leading-6 text-white/70">
            {props.demoMode ? (
              <>Demo-safe mock AI generated from computed scores and evidence summaries. No external model calls.</>
            ) : (
              <>Generated from computed scores and evidence summaries. Output is read-only.</>
            )}
          </p>
          <div className="mt-2 text-xs font-semibold tracking-wide text-white/60" aria-live="polite">
            {scopeLabel}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canGenerate || state.status === "loading"}
            onClick={generate}
            className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
              canGenerate
                ? "bg-white/10 text-white ring-white/15 hover:bg-white/15 disabled:opacity-60"
                : "bg-white/5 text-white/50 ring-white/10"
            }`}
            data-testid="qbr-generate"
          >
            {state.status === "loading" ? "Generating…" : state.status === "ready" ? "Regenerate" : "Generate brief"}
          </button>

          {props.demoMode ? (
            <button
              type="button"
              disabled={!canGenerate || state.status === "loading"}
              onClick={() => setVariant((v) => (v + 1) % 3)}
              className="inline-flex items-center justify-center rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              data-testid="qbr-variant"
              aria-label="Change mock variation"
              title="Change mock variation"
            >
              Variation {variant + 1}
            </button>
          ) : null}
        </div>
      </div>

      {!props.carrier ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
          Select a carrier to generate a brief grounded in its scorecard.
        </div>
      ) : state.status === "idle" ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
          Click Generate brief to produce strengths, concerns, questions, and governance actions for the selected
          carrier.
        </div>
      ) : state.status === "loading" ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70" aria-busy="true">
          Generating QBR brief…
        </div>
      ) : state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
          {state.message}
        </div>
      ) : state.status === "ready" ? (
        state.data.ok ? (
          <div className="mt-4 space-y-3" data-testid="qbr-brief">
            {state.data.dataNotice ? (
              <div
                className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70"
                data-testid="qbr-data-notice"
              >
                {state.data.dataNotice.message}
              </div>
            ) : null}
            <Section title="Strengths" items={state.data.brief.strengths} />
            <Section title="Concerns" items={state.data.brief.concerns} />
            <Section title="Questions to ask" items={state.data.brief.questions} />
            <Section title="Governance actions" items={state.data.brief.governanceActions} />
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
            {state.data.error.message}
          </div>
        )
      ) : null}
    </div>
  );
}
