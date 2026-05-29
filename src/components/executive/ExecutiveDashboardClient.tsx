"use client";

import { use } from "react";

import { ExecutiveDashboard, type RuntimePosture } from "./ExecutiveDashboard";
import type { ScorecardsSummaryModel } from "./types";

type Props = {
  summary: Promise<ScorecardsSummaryModel>;
  runtime: RuntimePosture;
};

export function ExecutiveDashboardClient(props: Props) {
  const summary = use(props.summary);
  return <ExecutiveDashboard summary={summary} runtime={props.runtime} />;
}
