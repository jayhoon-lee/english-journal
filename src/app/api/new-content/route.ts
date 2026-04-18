import { createClient } from "@/lib/supabase/server";
import { getProvider, generateAIResponse } from "@/lib/ai-provider";
import { NextResponse } from "next/server";

const MOCK_RECOMMENDATIONS = [
  {
    type: "expression",
    content: "get the hang of",
    meaning: "요령을 터득하다, 감을 잡다",
    example: "It took me a while, but I finally got the hang of cooking pasta.",
    context: "새로운 기술이나 활동을 배우는 상황에서 사용합니다.",
    difficulty: "intermediate",
    recommendation_reason: "일상적으로 자주 쓰이는 표현으로, 학습 경험을 영어로 표현할 때 유용합니다.",
  },
  {
    type: "phrasal_verb",
    content: "come across",
    meaning: "우연히 발견하다, 마주치다",
    example: "I came across an interesting article about language learning.",
    context: "예상치 못하게 무언가를 발견했을 때 사용합니다.",
    difficulty: "easy",
    recommendation_reason: "일기에서 일상 경험을 묘사할 때 활용도가 높습니다.",
  },
  {
    type: "grammar",
    content: "I wish + 과거 시제",
    meaning: "~했으면 좋겠다 (현재 사실의 반대)",
    example: "I wish I had more time to study English.",
    context: "현재 상황에 대한 아쉬움이나 바람을 표현할 때 사용합니다.",
    difficulty: "intermediate",
    recommendation_reason: "가정법은 중급 이상에서 자주 등장하며, 감정 표현의 폭을 넓혀줍니다.",
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

  const provider = getProvider();

  if (provider === "mock") {
    return NextResponse.json({ recommendations: MOCK_RECOMMENDATIONS });
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

다음 JSON 배열로만 응답하세요. JSON 외 다른 텍스트는 포함하지 마세요:
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

  const text = await generateAIResponse(
    systemPrompt,
    `레벨: ${stats?.level || 1} (EQS: ${stats?.current_eqs || 0})\n\n[실수 패턴]\n${JSON.stringify(patterns || [])}\n\n[이미 학습 중인 표현 — 제외할 것]\n${JSON.stringify(existingList)}`
  );

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const recommendations = JSON.parse(cleaned);
    return NextResponse.json({ recommendations });
  } catch {
    return NextResponse.json({ error: "추천 생성 실패" }, { status: 500 });
  }
}
