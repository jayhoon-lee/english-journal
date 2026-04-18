import { createClient } from "@/lib/supabase/server";
import { getProvider, streamAIResponse } from "@/lib/ai-provider";
import { generateMockFeedback } from "@/lib/mock-feedback";
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
  const provider = getProvider();

  if (provider === "mock") {
    const mockFeedback = generateMockFeedback(text);
    const fullText = JSON.stringify(mockFeedback);
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const chars = fullText.split("");
        for (let i = 0; i < chars.length; i += 5) {
          const chunk = chars.slice(i, i + 5).join("");
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 10));
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, fullText })}\n\n`)
        );
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Real AI (Claude or Gemini)
  const { data: patterns } = await supabase
    .from("mistake_patterns")
    .select("pattern_name, rule, count, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("count", { ascending: false })
    .limit(10);

  const { data: expressions } = await supabase
    .from("expressions")
    .select("expression, meaning, usage_count")
    .eq("user_id", user.id)
    .order("usage_count", { ascending: false })
    .limit(20);

  const systemPrompt = `당신은 영어 코치입니다. 사용자가 제출한 영어 일기를 분석하세요.

중요한 규칙:
1. mistakes의 "original" 필드는 반드시 사용자가 실제로 쓴 텍스트에서 그대로 인용해야 합니다.
2. 사용자가 쓰지 않은 단어나 문장을 실수로 지적하지 마세요.
3. corrected_text는 사용자의 원문 전체를 교정한 버전이어야 합니다.
4. 실수가 없으면 mistakes를 빈 배열로 반환하세요.

[과거 실수 패턴 — 같은 실수를 반복하는지 참고용]
${JSON.stringify(patterns || [])}

[현재 학습 중인 표현 — 사용자가 활용했는지 확인]
${JSON.stringify(expressions || [])}

다음 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 포함하지 마세요:
{
  "corrected_text": "사용자 원문 전체를 교정한 버전",
  "mistakes": [
    {
      "pattern_name": "실수 패턴 이름 (한글)",
      "original": "사용자가 실제로 쓴 틀린 부분 (원문에서 그대로 인용)",
      "corrected": "올바르게 교정된 부분",
      "rule": "왜 틀렸는지 규칙 설명 (한글)",
      "is_new_pattern": true/false
    }
  ],
  "used_expressions": ["사용자가 실제로 사용한 학습 표현만"],
  "scoring": {
    "vocabulary_score": 0-100,
    "grammar_score": 0-100,
    "expression_score": 0-100,
    "accuracy_score": 0-100,
    "eqs": 0-100,
    "vocab_level": "A1-C2",
    "scoring_reason": {
      "vocabulary": "이유",
      "grammar": "이유",
      "expression": "이유",
      "accuracy": "이유"
    }
  },
  "feedback_summary": "전체 피드백 요약 (한글, 2-3문장)"
}`;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const rawText = await streamAIResponse(
        systemPrompt,
        text,
        (chunk) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }
      );

      const fullText = rawText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true, fullText })}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
