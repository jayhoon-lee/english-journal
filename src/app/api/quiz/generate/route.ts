import { createClient } from "@/lib/supabase/server";
import { getProvider, generateAIResponse } from "@/lib/ai-provider";
import { NextResponse } from "next/server";

const MOCK_QUESTIONS = [
  {
    quiz_type: "error_correction",
    question: "다음 문장에서 틀린 부분을 찾으세요: 'I go to the store yesterday.'",
    options: ["go → went", "to → at", "the → a", "오류 없음"],
    correct_answer: "go → went",
    explanation: "과거를 나타내는 'yesterday'와 함께 과거 시제 'went'를 사용해야 합니다.",
    related_pattern: "시제 불일치",
  },
  {
    quiz_type: "fill_blank",
    question: "I'm looking forward ___ seeing you.",
    options: ["to", "for", "at", "in"],
    correct_answer: "to",
    explanation: "'look forward to + ~ing'는 '~을 기대하다'라는 의미의 관용 표현입니다.",
    related_pattern: "전치사 오용",
  },
  {
    quiz_type: "expression_choice",
    question: "'정리하다, 질서를 잡다'라는 의미의 표현은?",
    options: ["get things in order", "get things off", "get things away", "get things around"],
    correct_answer: "get things in order",
    explanation: "'get things in order'는 '정리하다, 질서를 잡다'라는 의미입니다.",
    related_pattern: "표현 학습",
  },
];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { includeTrap } = await request.json();
  const provider = getProvider();

  if (provider === "mock") {
    return NextResponse.json({ questions: MOCK_QUESTIONS, patterns: [] });
  }

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

  const { data: recentEntries } = await supabase
    .from("journal_entries")
    .select("original_text, corrected_text")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!patterns?.length && !recentEntries?.length) {
    return NextResponse.json({
      error: "실수 패턴이 부족합니다. 먼저 일기를 작성해주세요.",
    }, { status: 400 });
  }

  const systemPrompt = `당신은 영어 퀴즈 출제자입니다.
사용자의 실수 패턴, 실제 작성한 문장, 학습 표현을 기반으로 퀴즈 3문제를 만드세요.
${includeTrap ? "함정 문제(정답처럼 보이지만 틀린 보기)를 포함하세요." : ""}

중요한 출제 원칙:
- 3문제 중 최소 1~2문제는 사용자가 실제로 쓴 문장(원문)을 활용해서 출제하세요.
- 나머지는 실수 패턴 규칙을 기반으로 새로운 예문으로 출제하세요.
- 사용자의 원문에 실수가 있었다면, 그 실수를 찾거나 교정하는 문제를 만드세요.

다음 JSON 배열로만 응답하세요. JSON 외 다른 텍스트는 포함하지 마세요:
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

  const userContext = [
    `[실수 패턴 (examples는 사용자가 실제로 틀린 문장)]`,
    JSON.stringify(patterns || []),
    `\n[사용자가 최근 작성한 일기 원문 + 교정본]`,
    JSON.stringify((recentEntries || []).map(e => ({
      original: e.original_text,
      corrected: e.corrected_text,
    }))),
    `\n[학습 표현]`,
    JSON.stringify(expressions || []),
  ].join("\n");

  const text = await generateAIResponse(systemPrompt, userContext);

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const questions = JSON.parse(cleaned);
    return NextResponse.json({ questions, patterns });
  } catch {
    return NextResponse.json({ error: "퀴즈 생성 실패" }, { status: 500 });
  }
}
