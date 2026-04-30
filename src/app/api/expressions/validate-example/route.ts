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

  const { expression, meaning, example } = await request.json();

  if (!expression || !example) {
    return NextResponse.json({ error: "expression과 example이 필요해요." }, { status: 400 });
  }

  const trimmed = String(example).trim();
  if (trimmed.length < 3) {
    return NextResponse.json({
      status: "rejected",
      reason: "예문이 너무 짧아요. 완전한 문장으로 써주세요.",
    });
  }

  const systemPrompt = `당신은 영어 예문 검토자입니다. 사용자가 학습 표현(expression)에 대해 작성한 예문을 검토하고 다음 JSON으로만 응답하세요.

검토 기준:
1. 예문에 해당 표현이 실제로 포함되어 있는지 (시제·인칭 변형은 허용 — 예: "look forward to" 표현이면 "looked forward to" 도 OK)
2. 문법이 정확한지 (시제, 관사, 전치사, 주어-동사 일치 등)
3. 표현이 자연스럽게 사용되었는지 (원어민이 쓰는 맥락에 맞게)
4. 표현의 의미(meaning)에 부합하는지
5. 완전한 문장인지 (단어 나열이나 미완성 X)

응답 status:
- "ok": 문법·용법 모두 적절. 그대로 저장 가능.
- "needs_fix": 문법 오류나 어색함이 있지만 고치면 살릴 수 있음. corrected에 수정본 제공.
- "rejected": 표현이 들어있지 않거나, 의미가 완전히 다르거나, 단어 나열 등 도저히 살릴 수 없는 경우.

JSON 형식:
{
  "status": "ok" | "needs_fix" | "rejected",
  "issues": ["발견된 문제점 (한글, 간결하게)"],
  "corrected": "수정된 예문 (status가 needs_fix일 때만, 영어)",
  "explanation": "왜 이렇게 판정했는지 또는 왜 고쳤는지 설명 (한글, 1-2문장)"
}

JSON 외 다른 텍스트는 절대 포함하지 마세요.`;

  const userMsg = `표현: ${expression}
${meaning ? `뜻: ${meaning}` : ""}
사용자가 작성한 예문: ${trimmed}`;

  try {
    const text = await generateAIResponse(systemPrompt, userMsg, { temperature: 0.3 });
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        status: "needs_fix",
        issues: ["AI 응답을 처리하지 못했어요."],
        explanation: "잠시 후 다시 시도해주세요.",
      });
    }

    if (!["ok", "needs_fix", "rejected"].includes(result.status)) {
      result.status = "needs_fix";
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return NextResponse.json({
      error: `검토 중 오류: ${msg || "알 수 없는 오류"}`,
    }, { status: 500 });
  }
}
