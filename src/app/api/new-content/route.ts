import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: stats } = await supabase
    .from("user_stats")
    .select("level, current_eqs")
    .eq("user_id", user.id)
    .single();

  const { data: patterns } = await supabase
    .from("mistake_patterns")
    .select("pattern_name, rule")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(5);

  const { data: existing } = await supabase
    .from("expressions")
    .select("expression")
    .eq("user_id", user.id);

  const existingList = (existing || []).map((e) => e.expression);

  const systemPrompt = `당신은 영어 학습 콘텐츠 큐레이터입니다.
사용자의 레벨과 실수 패턴을 참고해서 새로운 학습 콘텐츠 3개를 추천하세요.
사용자가 이미 알고 있는 표현은 제외하세요.

다음 JSON 배열로만 응답하세요:
[
  {
    "type": "expression" | "grammar" | "vocabulary" | "phrasal_verb",
    "content": "추천 표현/문법/단어",
    "meaning": "한글 의미",
    "example": "예문",
    "context": "어떤 상황에서 사용하는지 (한글)",
    "difficulty": "easy" | "intermediate" | "advanced",
    "recommendation_reason": "이 사용자에게 추천하는 이유 (한글)"
  }
]`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `레벨: ${stats?.level || 1} (EQS: ${stats?.current_eqs || 0})\n\n[실수 패턴]\n${JSON.stringify(patterns || [])}\n\n[이미 학습 중인 표현 — 제외할 것]\n${JSON.stringify(existingList)}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const recommendations = JSON.parse(text);
    return NextResponse.json({ recommendations });
  } catch {
    return NextResponse.json({ error: "추천 생성 실패" }, { status: 500 });
  }
}
