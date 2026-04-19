import { createClient } from "@/lib/supabase/server";
import { getProvider, generateAIResponse } from "@/lib/ai-provider";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { topic, levelAdjust, maxWords, previousTitle } = await request.json();
  const provider = getProvider();

  const { data: stats } = await supabase
    .from("user_stats")
    .select("level, current_eqs")
    .eq("user_id", user.id)
    .single();

  const { data: patterns } = await supabase
    .from("mistake_patterns")
    .select("pattern_name, rule")
    .eq("user_id", user.id)
    .in("status", ["active", "improving"])
    .limit(5);

  const { data: expressions } = await supabase
    .from("expressions")
    .select("expression, meaning")
    .eq("user_id", user.id)
    .limit(15);

  if (provider === "mock") {
    return NextResponse.json({
      article: {
        title: "A Day at the Coffee Shop",
        content: "Last weekend, I decided to visit a new coffee shop in my neighborhood. Initially, I was hesitant because I usually go to the same place every day. However, I wanted to get things in order and try something different.\n\nThe café had a cozy atmosphere with warm lighting and soft music. I ordered a latte and sat by the window. As I was looking forward to enjoying my drink, I noticed a bookshelf filled with English novels.\n\nI picked up a book and started reading. It was challenging at first, but I gradually got the hang of it. The story was about a young woman who came across an old diary in her grandmother's attic.\n\nI spent two hours there, completely absorbed in the book. It made me realize that stepping out of my comfort zone can lead to wonderful discoveries. I wish I had done this sooner!",
        level: "B1",
        topic: topic || "일상",
        highlightWords: [
          { word: "Initially", meaning: "처음에는", type: "expression", source: "user" },
          { word: "get things in order", meaning: "정리하다", type: "expression", source: "user" },
          { word: "looking forward to", meaning: "~을 기대하다", type: "expression", source: "user" },
          { word: "got the hang of", meaning: "요령을 터득하다", type: "expression", source: "ai" },
          { word: "came across", meaning: "우연히 발견하다", type: "expression", source: "ai" },
        ],
      },
    });
  }

  const baseLevel = stats?.level || 1;
  const adjustedLevel = Math.max(1, Math.min(9, baseLevel + (levelAdjust || 0)));
  const cefrMap: Record<number, string> = {
    1: "A1", 2: "A2", 3: "A2-B1", 4: "B1", 5: "B1-B2",
    6: "B2", 7: "B2-C1", 8: "C1", 9: "C1-C2",
  };
  const targetCefr = cefrMap[adjustedLevel] || "B1";
  const wordLimit = maxWords || 200;

  const expressionList = (expressions || []).map(e => `${e.expression} (${e.meaning})`);
  const patternList = (patterns || []).map(p => p.pattern_name);

  const systemPrompt = `당신은 영어 학습용 아티클 작성자입니다.
사용자의 수준(CEFR ${targetCefr})에 맞는 영어 아티클을 작성하세요.

중요한 규칙:
1. 아티클은 영어로 작성 (${wordLimit}단어 내외, 최대 ${wordLimit + 50}단어)
2. 사용자가 학습 중인 표현을 자연스럽게 포함시키세요
3. 사용자의 실수 패턴과 관련된 올바른 용례를 포함시키세요
4. 주제는 일상적이고 흥미로운 내용
5. 본문에 **bold**, __italic__ 등 마크다운 서식을 사용하지 마세요. 순수 텍스트만 사용하세요.

다음 JSON으로만 응답하세요:
{
  "title": "아티클 제목 (영어)",
  "content": "아티클 본문 (영어, 단락 구분은 \\n\\n)",
  "level": "CEFR 레벨",
  "topic": "주제 (한글)",
  "highlightWords": [
    {
      "word": "아티클에서 사용한 학습 표현 또는 실수 패턴 관련 표현",
      "meaning": "한글 뜻",
      "type": "expression 또는 mistake",
      "source": "user (사용자가 학습 중인 표현) 또는 ai (AI가 새로 제안하는 표현)"
    }
  ]
}`;

  const userMsg = `사용자 레벨: CEFR ${targetCefr} (Lv.${adjustedLevel})
${topic ? `원하는 주제: ${topic}` : "주제: 자유 (일상, 여행, 취미 등 흥미로운 주제)"}
${previousTitle ? `이전에 "${previousTitle}"이라는 글을 생성했으니, 완전히 다른 주제와 내용으로 작성하세요.` : ""}

[사용자가 학습 중인 표현 — 이 중 3~5개를 자연스럽게 포함, source를 "user"로 표시]
${expressionList.join(", ") || "없음"}

[사용자의 실수 패턴 — 올바른 용례를 포함, source를 "user"로 표시]
${patternList.join(", ") || "없음"}

위 목록에 없는 새로운 유용한 표현도 2~3개 추가로 포함하고, source를 "ai"로 표시하세요.`;

  try {
    const text = await generateAIResponse(systemPrompt, userMsg);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const article = JSON.parse(cleaned);
    article.content = article.content.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1");
    return NextResponse.json({ article });
  } catch {
    return NextResponse.json({ error: "아티클 생성에 실패했습니다." }, { status: 500 });
  }
}
