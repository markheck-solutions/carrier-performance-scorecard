"use client";

import { use } from "react";

import { ExecutiveDashboardInteractive, type RuntimePosture } from "./ExecutiveDashboardInteractive";
import type { ScorecardsSummaryModel } from "./types";

type Props = {
  summary: Promise<ScorecardsSummaryModel>;
  runtime: RuntimePosture;
};

export function ExecutiveDashboardClient(props: Props) {
  const summary = use(props.summary);
  return <ExecutiveDashboardInteractive initialSummary={summary} runtime={props.runtime} />;
}
