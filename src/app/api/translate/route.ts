import { createClient } from "@/lib/supabase/server";
import { generateAIResponse } from "@/lib/ai-provider";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text } = await request.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text가 필요해요." }, { status: 400 });
  }

  const systemPrompt = `당신은 영한 번역 전문가입니다. 영어 문장을 자연스러운 한국어로 번역하세요.

규칙:
1. 의미를 최대한 정확하게 전달하되, 직역보다는 자연스러운 한국어로
2. 번역만 출력하고 그 외 설명, 따옴표, 마크다운은 절대 포함하지 마세요
3. 문장이 여러 개면 그대로 여러 문장으로 번역`;

  try {
    const result = await generateAIResponse(systemPrompt, text, { temperature: 0.3 });
    const translation = result.replace(/^["'`]|["'`]$/g, "").trim();
    return NextResponse.json({ translation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return NextResponse.json({
      error: `번역 중 오류: ${msg || "알 수 없는 오류"}`,
    }, { status: 500 });
  }
}
