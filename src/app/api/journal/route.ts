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

  const { text } = await request.json();

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

  const systemPrompt = `당신은 영어 코치입니다. 사용자의 과거 데이터를 참고해서 분석하세요.

[과거 실수 패턴]
${JSON.stringify(patterns || [])}

[현재 학습 중인 표현]
${JSON.stringify(expressions || [])}

다음 JSON 형식으로만 응답하세요:
{
  "corrected_text": "교정된 전문",
  "mistakes": [
    {
      "pattern_name": "실수 패턴 이름 (한글)",
      "original": "원문 중 틀린 부분",
      "corrected": "교정된 부분",
      "rule": "규칙 설명 (한글)",
      "is_new_pattern": true/false
    }
  ],
  "used_expressions": ["사용된 학습 표현들"],
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

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
          );
        }
      }

      const finalMessage = await stream.finalMessage();
      const fullText =
        finalMessage.content[0].type === "text"
          ? finalMessage.content[0].text
          : "";

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ done: true, fullText })}\n\n`
        )
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
