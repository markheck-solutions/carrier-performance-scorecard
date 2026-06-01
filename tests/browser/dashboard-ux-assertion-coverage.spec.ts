import { expect, test } from "@playwright/test";

type ScoreMetric =
  | { kind: "ratio"; numerator: number; denominator: number; unit: string }
  | { kind: "scalar"; value: number; unit: string };

type ScoreComponent = {
  id: string;
  metric: ScoreMetric;
  dataQuality?: { availability?: "ok" | "insufficient_data" };
};

type SummaryCarrier = {
  carrier: { id: string; name: string; shortCode: string };
  totalScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  confidence?: { label?: "high" | "medium" | "low" };
  sampleCount?: number;
  components?: ScoreComponent[];
};

type SummaryOk = {
  ok: true;
  counts: { carriers: number; deliveryRecords: number; evidenceItems: number };
  aggregates: { delayReasons: Array<{ delayReason: string; count: number }> };
  carriers: SummaryCarrier[];
};

type CarrierDetailOk = {
  ok: true;
  carrier: { id: string; name: string; shortCode: string } | null;
  scorecard: unknown | null;
  message: string | null;
};

function gradeFromScore(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function portfolioHealth(scorecards: Array<{ totalScore: number }>) {
  if (scorecards.length === 0) return { score: 0, grade: gradeFromScore(0) };
  const avg = scorecards.reduce((acc, c) => acc + c.totalScore, 0) / scorecards.length;
  const score = Math.round(avg);
  return { score, grade: gradeFromScore(score) };
}

function governanceAttentionCount(scorecards: Array<{ grade: string }>) {
  return scorecards.filter((c) => c.grade === "D" || c.grade === "F").length;
}

function lowConfidenceCount(scorecards: Array<{ confidence?: { label?: string } }>) {
  return scorecards.filter((c) => c.confidence?.label === "low").length;
}

function commitmentOnTimeRate(
  scorecards: Array<{
    components?: Array<{ id: string; metric?: { kind: string; numerator?: number; denominator?: number } }>;
  }>,
) {
  let onTime = 0;
  let completed = 0;
  for (const sc of scorecards) {
    const comp = sc.components?.find((c) => c.id === "commitment_adherence");
    const metric = comp?.metric;
    if (!metric || metric.kind !== "ratio") continue;
    onTime += metric.numerator ?? 0;
    completed += metric.denominator ?? 0;
  }
  const rate = completed > 0 ? onTime / completed : 0;
  return { onTime, completed, rate };
}

function completionTrendLabel(
  scorecards: Array<{
    sampleCount?: number;
    components?: Array<{
      id: string;
      metric?: { kind: string; value?: number };
      dataQuality?: { availability?: string };
    }>;
  }>,
) {
  let weightedDelta = 0;
  let weight = 0;
  for (const sc of scorecards) {
    const comp = sc.components?.find((c) => c.id === "completion_trend");
    if (!comp || comp.metric?.kind !== "scalar") continue;
    const available = comp.dataQuality?.availability === "ok";
    if (!available) continue;
    const sample = sc.sampleCount ?? 0;
    weightedDelta += (comp.metric.value ?? 0) * sample;
    weight += sample;
  }
  if (weight <= 0) return "Unknown";
  const delta = weightedDelta / weight;
  if (delta >= 0.05) return "Improving";
  if (delta <= -0.05) return "Declining";
  if (delta <= -0.02) return "Watch";
  return "Stable";
}

function extractFirstNumber(text: string) {
  const match = text.match(/(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

function escapeRegex(raw: string) {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertSummaryOk(payload: unknown): asserts payload is SummaryOk {
  if (!payload || typeof payload !== "object") throw new Error("Expected summary payload to be an object.");
  const rec = payload as Record<string, unknown>;
  if (rec.ok !== true) throw new Error("Expected summary payload ok=true.");
  if (!rec.counts || typeof rec.counts !== "object") throw new Error("Expected summary payload counts.");
  if (!Array.isArray(rec.carriers)) throw new Error("Expected summary payload carriers array.");
  if (!rec.aggregates || typeof rec.aggregates !== "object") throw new Error("Expected summary payload aggregates.");
}

function assertCarrierDetailOk(payload: unknown): asserts payload is CarrierDetailOk {
  if (!payload || typeof payload !== "object") throw new Error("Expected carrier detail payload to be an object.");
  const rec = payload as Record<string, unknown>;
  if (rec.ok !== true) throw new Error("Expected carrier detail payload ok=true.");
}

async function getSummary(page: import("@playwright/test").Page, query: string): Promise<SummaryOk> {
  const res = await page.request.get(`/api/scorecards/summary${query}`);
  expect(res.ok()).toBeTruthy();
  const payload = (await res.json()) as unknown;
  assertSummaryOk(payload);
  return payload;
}

test("filter changes update KPIs, health, comparison, trends, delay patterns, detail, evidence entry points, and executive context (VAL-CARRIER-002)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /leadership kpis/i })).toBeVisible();

  const baseline = await getSummary(page, "");
  expect(baseline.counts.deliveryRecords).toBeGreaterThan(0);

  // Apply filters (region + product) that are known to exist in the demo dataset.
  await page.getByLabel("Region").selectOption("emea");
  await page.getByLabel("Product type").selectOption("colocation");
  await expect(page).toHaveURL(/region=emea/);
  await expect(page).toHaveURL(/productType=colocation/);

  const filtered = await getSummary(page, "?region=emea&productType=colocation");
  expect(filtered.counts.deliveryRecords).toBeGreaterThan(0);
  expect(filtered.counts.deliveryRecords).not.toBe(baseline.counts.deliveryRecords);

  // Wait for the UI to reflect the filtered summary (avoid reading "previous" while transition is pending).
  const scope = page.getByRole("region", { name: /scope filters/i });
  await expect(scope.getByText(/Region EMEA/i)).toBeVisible({ timeout: 10_000 });
  await expect(scope.getByText(/Product colocation/i)).toBeVisible({ timeout: 10_000 });

  // 1) KPIs reflect filtered-scope values.
  const kpis = page.locator('section[aria-label="Leadership KPIs"]');
  const kpiCard = (label: string) => kpis.getByText(label, { exact: true }).locator("..");
  const expectedPortfolio = portfolioHealth(filtered.carriers);
  const expectedGovernance = governanceAttentionCount(filtered.carriers);
  const expectedOnTime = commitmentOnTimeRate(filtered.carriers);
  const expectedLowConfidence = lowConfidenceCount(filtered.carriers);

  await expect(kpiCard("Portfolio health")).toBeVisible();
  await expect(
    kpiCard("Portfolio health").getByText(
      new RegExp(`${escapeRegex(expectedPortfolio.grade)}\\s*\\(${expectedPortfolio.score}\\)`),
    ),
  ).toBeVisible();
  await expect(
    kpiCard("Portfolio health").getByText(new RegExp(`${filtered.counts.carriers}\\s+carriers in scope`)),
  ).toBeVisible();

  await expect(kpiCard("Governance attention")).toBeVisible();
  await expect(kpiCard("Governance attention").getByText(String(expectedGovernance), { exact: true })).toBeVisible();

  await expect(kpiCard("Commitment on-time")).toBeVisible();
  await expect(
    kpiCard("Commitment on-time").getByText(new RegExp(`${Math.round(expectedOnTime.rate * 100)}%`)),
  ).toBeVisible();
  await expect(
    kpiCard("Commitment on-time").getByText(new RegExp(`${expectedOnTime.onTime}\\s*/\\s*${expectedOnTime.completed}`)),
  ).toBeVisible();

  await expect(kpiCard("Low-confidence reads")).toBeVisible();
  await expect(kpiCard("Low-confidence reads").getByText(String(expectedLowConfidence), { exact: true })).toBeVisible();

  await expect(kpiCard("Evidence items")).toBeVisible();
  await expect(
    kpiCard("Evidence items").getByText(String(filtered.counts.evidenceItems), { exact: true }),
  ).toBeVisible();
  await expect(
    kpiCard("Evidence items").getByText(new RegExp(`${filtered.counts.deliveryRecords}\\s+delivery records`)),
  ).toBeVisible();

  // 2) Carrier health spectrum reflects the same computed portfolio grade/score.
  const spectrum = page
    .getByRole("heading", { name: /carrier health spectrum/i })
    .locator("..")
    .locator("..");
  await expect(
    spectrum.getByText(new RegExp(`Portfolio:\\s+${expectedPortfolio.grade}\\s+\\(${expectedPortfolio.score}\\)`)),
  ).toBeVisible();

  // 3) Executive context panels match best/worst in the filtered comparison ordering.
  const bestPanel = page
    .getByRole("heading", { name: /^Best performer$/ })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(bestPanel.getByText(filtered.carriers[0].carrier.name, { exact: false })).toBeVisible();

  const worstPanel = page
    .getByRole("heading", { name: /^Needs governance attention$/ })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(
    worstPanel.getByText(filtered.carriers[filtered.carriers.length - 1].carrier.name, { exact: false }),
  ).toBeVisible();

  // 4) Trend direction panel reflects filtered carrier set (computed label).
  const expectedTrend = completionTrendLabel(filtered.carriers);
  const trendPanel = page
    .getByRole("heading", { name: /^Trend direction$/ })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(trendPanel.getByText(expectedTrend)).toBeVisible();

  // 5) Delay concentration panel matches filtered delay aggregates and enables proof entry.
  const delayPanel = page
    .getByRole("heading", { name: /^Delay concentration$/ })
    .locator("..")
    .locator("..")
    .locator("..");
  const topDelay =
    (filtered.aggregates.delayReasons as Array<{ delayReason: string; count: number }>).find(
      (d) => d.delayReason !== "none",
    ) ?? null;
  expect(topDelay).toBeTruthy();
  await expect(delayPanel.getByText(topDelay!.delayReason, { exact: false })).toBeVisible();

  // 6) Comparison updates and selecting a carrier loads matching detail.
  const comparisonRegion = page.getByRole("region", { name: /carrier comparison and detail/i });
  await expect(comparisonRegion.getByText(new RegExp(`\\b${filtered.counts.carriers}\\s+carriers\\b`))).toBeVisible();
  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  const selectedCarrierId = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedCarrierId) throw new Error("Expected selectedCarrierId after selecting a carrier.");

  const detailRes = await page.request.get(
    `/api/carriers/${selectedCarrierId}/scorecard?region=emea&productType=colocation`,
  );
  expect(detailRes.ok()).toBeTruthy();
  const detailPayload = (await detailRes.json()) as unknown;
  assertCarrierDetailOk(detailPayload);
  expect(detailPayload.carrier).toBeTruthy();

  const detailPanel = page
    .getByRole("heading", { name: /selected carrier detail/i })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(detailPanel.getByText(detailPayload.carrier!.name, { exact: false })).toBeVisible({ timeout: 10_000 });

  // 7) Evidence entry points honor the same active filters.
  const componentProof = page.locator('[data-evidence-origin^="dimension:"]').first();
  await expect(componentProof).toBeVisible({ timeout: 10_000 });
  await componentProof.click();

  const drawer = page.getByRole("dialog", { name: /evidence drawer/i });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: /^Close$/ })).toBeVisible();

  // Evidence drawer should show filtered region/product context in returned proof items (when items exist).
  await Promise.race([
    expect(drawer.locator("article").first()).toBeVisible({ timeout: 10_000 }),
    expect(drawer.getByText(/no proof items are available/i)).toBeVisible({ timeout: 10_000 }),
  ]);
  if ((await drawer.locator("article").count()) > 0) {
    await expect(drawer.getByText(/EMEA/i)).toBeVisible();
    await expect(drawer.getByText(/Colocation/i)).toBeVisible();
  }
});

test("combined filters compose by intersection and active filter pills remain visible (VAL-CARRIER-003)", async ({
  page,
}) => {
  // Use a direct URL to avoid relying on select timing while still validating visible active pills + intersection results.
  await page.goto("/?region=emea&productType=colocation");
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();
  await expect(page).toHaveURL(/region=emea/);
  await expect(page).toHaveURL(/productType=colocation/);

  // Wait for the filtered summary to resolve before asserting intersection outputs.
  await expect(page.getByRole("button", { name: /Region:\s+EMEA/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Product:\s+colocation/i })).toBeVisible({ timeout: 10_000 });

  // Active filters remain visible as pills.
  await expect(page.getByRole("button", { name: /Region:\s+EMEA/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Product:\s+colocation/i })).toBeVisible();
  await expect(page.getByText(/filters compose by intersection/i)).toBeVisible();

  const regionOnly = await getSummary(page, "?region=emea");
  const productOnly = await getSummary(page, "?productType=colocation");
  const both = await getSummary(page, "?region=emea&productType=colocation");

  expect(both.counts.deliveryRecords).toBeGreaterThan(0);
  expect(both.counts.deliveryRecords).toBeLessThanOrEqual(regionOnly.counts.deliveryRecords);
  expect(both.counts.deliveryRecords).toBeLessThanOrEqual(productOnly.counts.deliveryRecords);

  const regionIds = new Set(regionOnly.carriers.map((c) => c.carrier.id));
  const productIds = new Set(productOnly.carriers.map((c) => c.carrier.id));
  for (const c of both.carriers) {
    expect(regionIds.has(c.carrier.id)).toBe(true);
    expect(productIds.has(c.carrier.id)).toBe(true);
  }

  // UI count for delivery records matches the combined-filter API count (intersection semantics reflected end-to-end).
  const evidenceKpi = page.locator('section[aria-label="Leadership KPIs"]').getByText("Evidence items").locator("..");
  const deliveryDetailText = (await evidenceKpi.getByText(/delivery records/i).textContent()) ?? "";
  const deliveryMatch = deliveryDetailText.match(/(\d+)\s+delivery records/);
  const deliveryCount = deliveryMatch ? Number(deliveryMatch[1]) : extractFirstNumber(deliveryDetailText);
  expect(deliveryCount).toBe(both.counts.deliveryRecords);

  const comparisonRegion = page.getByRole("region", { name: /carrier comparison and detail/i });
  await expect(comparisonRegion.getByText(new RegExp(`\\b${both.counts.carriers}\\s+carriers\\b`))).toBeVisible();
});

test("carrier surfaces show safe loading and error states for filter options, comparison, detail, and evidence without stale content (VAL-CARRIER-023)", async ({
  page,
}) => {
  // Fail filter options once to assert safe retry behavior.
  let failOptions = true;
  await page.route("**/api/scorecards/options", async (route) => {
    if (failOptions) {
      failOptions = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "boom" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByText(/unable to load filter options/i)).toBeVisible();
  await page
    .getByRole("button", { name: /^Retry$/ })
    .first()
    .click();
  await expect(
    page.getByLabel("Carrier", { exact: true }).locator("option", { hasText: /Aurora TransitLink/i }),
  ).toHaveCount(1);

  // Fail the next summary fetch triggered by a filter change.
  let failSummary = true;
  await page.route("**/api/scorecards/summary**", async (route) => {
    if (!failSummary) {
      await route.continue();
      return;
    }
    failSummary = false;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Unable to load scorecards for this scope." } }),
    });
  });

  await page.getByLabel("Region").selectOption("emea");
  await expect(page.getByText(/unable to load scorecards for this scope/i).first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Retry$/ })
    .first()
    .click();
  await expect(page.getByTestId("comparison-card").first()).toBeVisible({ timeout: 10_000 });

  // Select carrier A successfully.
  const cards = page.getByTestId("comparison-card");
  await cards.nth(0).click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  const selectedA = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedA) throw new Error("Expected selectedCarrierId for carrier A.");
  const resA = await page.request.get(`/api/carriers/${selectedA}/scorecard?region=emea`);
  expect(resA.ok()).toBeTruthy();
  const payloadA = (await resA.json()) as unknown;
  assertCarrierDetailOk(payloadA);
  expect(payloadA.carrier).toBeTruthy();
  const carrierAName = payloadA.carrier!.name;
  const detailPanel = page
    .getByRole("heading", { name: /selected carrier detail/i })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(detailPanel.getByText(carrierAName, { exact: false })).toBeVisible({ timeout: 10_000 });

  // Fail a subsequent carrier detail request and ensure we never show carrier A stale detail under the new selection.
  let failDetail = true;
  await page.route("**/api/carriers/**/scorecard**", async (route) => {
    if (!failDetail) {
      await route.continue();
      return;
    }
    const url = route.request().url();
    if (url.includes(`/api/carriers/${selectedA}/scorecard`)) {
      await route.continue();
      return;
    }
    failDetail = false;
    // Ensure the UI has time to render the structured loading state before the failure arrives.
    await new Promise((r) => setTimeout(r, 250));
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Unable to load carrier detail right now." } }),
    });
  });

  await cards.nth(1).click();
  await expect(detailPanel.getByText(/loading carrier detail/i)).toBeVisible({ timeout: 10_000 });
  await expect(detailPanel.getByText(carrierAName, { exact: false })).not.toBeVisible();
  await expect(detailPanel.getByText(/unable to load carrier detail right now/i)).toBeVisible({ timeout: 10_000 });
  const detailText = (await detailPanel.textContent()) ?? "";
  expect(detailText).not.toMatch(/select \*|drizzle|DATABASE_URL|C:\\|C:\//i);

  // Evidence: open once successfully, then fail a subsequent request and ensure no stale proof items remain visible.
  // Select carrier A again to have stable proof entry points.
  await cards.nth(0).click();
  await expect(detailPanel.getByText(carrierAName, { exact: false })).toBeVisible({ timeout: 10_000 });

  const componentProof = page.locator('[data-evidence-origin^="dimension:"]').first();
  await expect(componentProof).toBeVisible({ timeout: 10_000 });
  await componentProof.click();

  const drawer = page.getByRole("dialog", { name: /evidence drawer/i });
  await expect(drawer).toBeVisible();
  await Promise.race([
    expect(drawer.locator("article").first()).toBeVisible({ timeout: 10_000 }),
    expect(drawer.getByText(/no proof items are available/i)).toBeVisible({ timeout: 10_000 }),
  ]);
  let priorEvidenceText = "";
  if ((await drawer.locator("article").count()) > 0) {
    priorEvidenceText = (await drawer.locator("article").first().textContent()) ?? "";
  }

  await drawer.getByRole("button", { name: /^Close$/ }).click();
  await expect(drawer).not.toBeVisible();

  let failEvidence = true;
  await page.route("**/api/evidence**", async (route) => {
    if (!failEvidence) {
      await route.continue();
      return;
    }
    failEvidence = false;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Unable to load evidence right now." } }),
    });
  });

  await componentProof.click();
  await expect(drawer).toBeVisible();
  // Depending on timing, the evidence request may show a brief loading label or go straight to the safe error state.
  await Promise.race([
    expect(drawer.getByText(/loading evidence/i)).toBeVisible({ timeout: 5_000 }),
    expect(drawer.getByText(/unable to load evidence right now/i)).toBeVisible({ timeout: 5_000 }),
  ]);
  if (priorEvidenceText.trim().length > 0) {
    await expect(drawer.getByText(priorEvidenceText, { exact: false })).not.toBeVisible();
  }
  await expect(drawer.getByText(/unable to load evidence right now/i)).toBeVisible({ timeout: 10_000 });
  const drawerText = (await drawer.textContent()) ?? "";
  expect(drawerText).not.toMatch(/select \*|drizzle|DATABASE_URL|C:\\|C:\//i);
});
