// /api/skills — GET the enterprise skill registry; POST simulates adopting a version.
import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ skills: data.skills });
}

// POST { skillId, version } — simulate adopting (opting the org into) a skill version.
// Memory-follows-the-entity: adoption is a metadata op on the skill's enterprise thread,
// not a generation. We do NOT mutate the canonical dataset here — we echo the adopted
// version so the client can optimistically reflect it (the Zustand store owns local state).
export async function POST(req: NextRequest) {
  let body: { skillId?: string; version?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { skillId, version } = body;
  if (!skillId || !version) {
    return NextResponse.json({ ok: false, error: "skillId and version are required" }, { status: 400 });
  }

  const skill = data.skills.find((s) => s.id === skillId);
  if (!skill) {
    return NextResponse.json({ ok: false, error: `skill not found: ${skillId}` }, { status: 404 });
  }

  const target = skill.versions.find((v) => v.version === version);
  if (!target) {
    return NextResponse.json({ ok: false, error: `version not found: ${skillId}@${version}` }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    adopted: {
      skillId: skill.id,
      name: skill.name,
      version: target.version,
      bump: target.bump,
      derivedFromCapsule: target.derivedFromCapsule,
      tag: `${skill.id}@${target.version}`,
    },
  });
}
