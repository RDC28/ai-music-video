import { geminiAgent } from "@/utils/geminiAgents";
import { normalizeShotListForVeo } from "@/utils/shotList";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { projectState } = await req.json();

    if (!projectState) {
      return NextResponse.json({ error: "Missing projectState" }, { status: 400 });
    }

    const result = await geminiAgent.generateShotList(projectState);
    const shots = normalizeShotListForVeo(result);

    if (!shots.length) {
      return NextResponse.json({ error: "Gemini returned an empty shot list" }, { status: 502 });
    }

    return NextResponse.json({
      shots,
      coverage_notes: result.coverage_notes || result.coverage || '',
    });
  } catch (error) {
    console.error("Shot List Generation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
