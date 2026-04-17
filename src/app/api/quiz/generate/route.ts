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

  const { includeTrap } = await request.json();

  const { data: patterns } = await supabase
    .from("mistake_patterns")
    .select("id, pattern_name, rule, examples")
    .eq("user_id", user.id)
    .in("status", ["active", "improving"])
    .order("count", { ascending: false })
    .limit(5);

  const { data: expressions } = await supabase
    .from("expressions")
    .select("expression, meaning")
    .eq("user_id", user.id)
    .limit(10);

  if (!patterns?.length) {
    return NextResponse.json({
      error: "실수 패턴이 부족합니다. 먼저 일기를 작성해주세요.",
    }, { status: 400 });
  }

  const systemPrompt = `당신은 영어 퀴즈 출제자입니다.
사용자의 실수 패턴과 학습 표현을 기반으로 퀴즈 3문제를 만드세요.
${includeTrap ? "함정 문제(정답처럼 보이지만 틀린 보기)를 포함하세요." : ""}

다음 JSON 배열로만 응답하세요:
[
  {
    "quiz_type": "error_correction" | "fill_blank" | "expression_choice",
    "question": "문제 내용",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "correct_answer": "정답",
    "explanation": "해설 (한글)",
    "related_pattern": "관련 실수 패턴 이름"
  }
]`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `[실수 패턴]\n${JSON.stringify(patterns)}\n\n[학습 표현]\n${JSON.stringify(expressions)}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const questions = JSON.parse(text);
    return NextResponse.json({ questions, patterns });
  } catch {
    return NextResponse.json({ error: "퀴즈 생성 실패" }, { status: 500 });
  }
}
