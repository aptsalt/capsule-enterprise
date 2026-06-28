// EVAL (live) — run a REAL paired A/B on the hosted app using the free Gemini
// provider, which returns genuine measured token counts (usageMetadata). This is
// the "for real, live" counterpart to the recorded A/B trials in the dataset:
// same paired design (WITH the capsule guidance injected vs a COLD task), but
// measured fresh on each request. Mirrors the math in src/lib/eval.ts.
import { NextRequest } from "next/server";
import { data } from "@/lib/data";
import { geminiEnabled, geminiMeasured, GEMINI_MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const repTask = (skillName: string, project: string): string =>
  `Write a short TypeScript function and explain the key correctness consideration for this task: "${skillName}" in a ${project} codebase. Keep it under 20 lines.`;

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const round = (n: number): number => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  if (!geminiEnabled()) {
    return Response.json(
      { error: "Live A/B needs a model. Set GEMINI_API_KEY on the deployment." },
      { status: 503 },
    );
  }

  let body: { skillId?: string; nRuns?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }

  const skill =
    data.skills.find((s) => s.id === body.skillId) ||
    data.skills.find((s) => s.optedIn) ||
    data.skills[0];
  const latest = skill.versions[skill.versions.length - 1];
  const guidance = latest?.learnedFrom?.finding || skill.description;
  const task = repTask(skill.name, "Workspace");
  const nRuns = Math.min(Math.max(body.nRuns ?? 3, 1), 5);

  const withTokens: number[] = [];
  const withoutTokens: number[] = [];
  for (let i = 0; i < nRuns; i++) {
    // Paired: WITH the capsule guidance injected, then the COLD bare task.
    const w = await geminiMeasured(`Guidance you must follow:\n${guidance}\n\n${task}`);
    const wo = await geminiMeasured(task);
    if (w && wo) {
      withTokens.push(w.totalTokens);
      withoutTokens.push(wo.totalTokens);
    }
  }

  const n = Math.min(withTokens.length, withoutTokens.length);
  if (n === 0) {
    return Response.json({ error: "Live model unreachable — try again." }, { status: 502 });
  }

  const deltas = Array.from({ length: n }, (_, i) => withTokens[i] - withoutTokens[i]);
  const deltaMean = round(mean(deltas));
  const passRate = round(deltas.filter((d) => d < 0).length / deltas.length);
  const consistentDirection = deltas.every((d) => Math.sign(d) === Math.sign(deltas[0]));

  return Response.json({
    skillId: skill.id,
    skillName: skill.name,
    model: GEMINI_MODEL,
    nRuns: n,
    withMean: round(mean(withTokens)),
    withoutMean: round(mean(withoutTokens)),
    deltaMean,
    deltaStdev: round(stdev(deltas)),
    passRate,
    consistentDirection,
    withTokens,
    withoutTokens,
  });
}
