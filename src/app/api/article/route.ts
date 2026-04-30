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

  // 최근 생성된 아티클 제목들 (중복 회피용)
  const { data: recentArticles } = await supabase
    .from("articles")
    .select("title, topic")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

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
  const recentTitles = (recentArticles || []).map(a => a.title);
  const recentTopics = (recentArticles || []).map(a => a.topic).filter(Boolean);

  // 다양성을 위한 랜덤 시드: 장르/톤/관점/배경
  const GENRES = [
    "personal anecdote", "how-to guide", "opinion piece", "short fiction",
    "interview-style Q&A", "letter to a friend", "diary entry", "news-style report",
    "review (book/movie/restaurant)", "conversation transcript", "listicle",
    "historical vignette", "science explainer", "travel log", "recipe story",
  ];
  const TONES = [
    "humorous", "reflective", "energetic", "calm and contemplative",
    "sarcastic", "warm and personal", "matter-of-fact", "nostalgic",
    "curious and inquisitive", "dramatic",
  ];
  const PERSPECTIVES = [
    "first person (I)", "second person (you)", "third person (he/she/they)",
  ];
  const SETTINGS = [
    "a busy subway", "a quiet library", "a 1980s arcade", "a rural farm",
    "a tech startup office", "a Korean BBQ restaurant", "a hospital waiting room",
    "an airport at midnight", "a high school reunion", "a remote mountain cabin",
    "a beach during a storm", "an online forum", "a community garden",
    "a recording studio", "a vintage bookshop", "a noodle stall in Bangkok",
    "a retirement home", "a software bootcamp", "a wedding hall", "a public bath",
  ];
  const ANGLES = [
    "an unexpected mistake", "a small daily ritual", "a misunderstanding",
    "a chance meeting", "a long-held habit", "a piece of advice gone wrong",
    "an object with a history", "a deadline pressure", "a quiet realization",
    "a broken expectation", "a tiny victory", "a regret revisited",
  ];
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const seedGenre = pick(GENRES);
  const seedTone = pick(TONES);
  const seedPerspective = pick(PERSPECTIVES);
  const seedSetting = pick(SETTINGS);
  const seedAngle = pick(ANGLES);

  const systemPrompt = `당신은 영어 학습용 아티클 작성자입니다.
사용자의 수준(CEFR ${targetCefr})에 맞는 영어 아티클을 작성하세요.

중요한 규칙:
1. 아티클은 영어로 작성 (${wordLimit}단어 내외, 최대 ${wordLimit + 50}단어)
2. 사용자가 학습 중인 표현을 자연스럽게 포함시키세요
3. 사용자의 실수 패턴이 있으면, 그 패턴의 **올바른 형태**를 자연스럽게 사용해 정확한 용례를 보여주세요. 절대 틀린 형태를 본문에 쓰지 마세요.
4. 본문에 **bold**, __italic__ 등 마크다운 서식을 사용하지 마세요. 순수 텍스트만 사용하세요.
5. **다양성이 매우 중요합니다**: 매번 완전히 다른 장르/톤/주제/배경/관점으로 작성하세요. 같은 패턴 반복은 절대 금지.
6. 제목은 "The Art of ...", "A Day at ..." 같은 진부한 형식을 피하고, 구체적이고 신선하게.
7. **highlightWords의 type은 항상 "expression"만 사용하세요. "mistake" type은 절대 사용하지 마세요.** AI가 작성한 본문에는 실수가 있을 수 없습니다. 모든 하이라이트는 학습할 가치가 있는 올바른 표현입니다.

다음 JSON으로만 응답하세요:
{
  "title": "아티클 제목 (영어)",
  "content": "아티클 본문 (영어, 단락 구분은 \\n\\n)",
  "level": "CEFR 레벨",
  "topic": "주제 (한글)",
  "highlightWords": [
    {
      "word": "아티클에서 사용한 학습 표현 (모두 올바른 형태)",
      "meaning": "사전적 한글 뜻 (문맥상 의역 금지)",
      "type": "expression",
      "source": "user (사용자가 학습 중인 표현) 또는 ai (AI가 새로 제안하는 표현)"
    }
  ]
}`;

  const userMsg = `사용자 레벨: CEFR ${targetCefr} (Lv.${adjustedLevel})
${topic ? `원하는 주제: ${topic}` : ""}

[이번 아티클의 랜덤 시드 — 반드시 따르세요]
- 장르(genre): ${seedGenre}
- 톤(tone): ${seedTone}
- 시점(perspective): ${seedPerspective}
- 배경(setting): ${seedSetting}
- 핵심 모티프(angle): ${seedAngle}

위 시드를 조합해서 신선하고 구체적인 글을 쓰세요. 시드를 무시하지 마세요.

[이미 생성된 최근 제목 — 이것들과 비슷한 제목/주제/구조 절대 금지]
${recentTitles.length ? recentTitles.map(t => `- ${t}`).join("\n") : "(없음)"}

[이미 다룬 주제]
${recentTopics.length ? recentTopics.join(", ") : "(없음)"}

${previousTitle ? `특히 직전 글 "${previousTitle}"과는 완전히 다르게.` : ""}

[사용자가 학습 중인 표현 — 이 중 3~5개를 자연스럽게 포함, source를 "user"로 표시]
${expressionList.join(", ") || "없음"}

[사용자의 실수 패턴 — 올바른 용례를 포함, source를 "user"로 표시]
${patternList.join(", ") || "없음"}

위 목록에 없는 새로운 유용한 표현도 2~3개 추가로 포함하고, source를 "ai"로 표시하세요.`;

  try {
    const text = await generateAIResponse(systemPrompt, userMsg, { temperature: 1.0 });
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let article;
    try {
      article = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        error: "AI 응답을 처리할 수 없었어요. 다시 시도해주세요.",
      }, { status: 500 });
    }

    article.content = article.content.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1");

    // AI가 잘못 "mistake" type으로 응답해도 모두 "expression"으로 강제 변환
    if (Array.isArray(article.highlightWords)) {
      article.highlightWords = article.highlightWords.map((h: { type?: string }) => ({
        ...h,
        type: "expression",
      }));
    }

    // DB에 저장
    await supabase.from("articles").insert({
      user_id: user.id,
      title: article.title,
      content: article.content,
      level: article.level,
      topic: article.topic,
      highlight_words: article.highlightWords,
    });

    return NextResponse.json({ article });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("429") || msg.includes("quota") || msg.includes("Too Many")) {
      return NextResponse.json({
        error: "API 호출 한도를 초과했어요. 잠시 후 다시 시도해주세요 (무료 티어: 일 20회).",
      }, { status: 429 });
    }
    return NextResponse.json({
      error: `아티클 생성 중 오류가 발생했어요: ${msg || "알 수 없는 오류"}`,
    }, { status: 500 });
  }
}
