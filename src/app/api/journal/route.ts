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
5. pattern_name은 반드시 다음 6가지 중 하나만 사용하세요:
   - "문법" (시제, 관사, 전치사, 주어-동사 일치 등)
   - "어휘" (단어 선택, 철자 오류, 어색한 표현)
   - "문장 구조" (어순, 불완전한 문장, 접속사 오용)
   - "표현" (부자연스러운 표현, 관용구 오용)
   - "구두점" (쉼표, 마침표, 대소문자)
   - "기타"

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
  "used_expressions": [
    {
      "expression": "주목할 만한 표현 (관용구, 구동사, 고급 어휘만. 일반적 표현 제외)",
      "meaning": "한글 뜻",
      "example": "아티클/일기에서 해당 표현이 사용된 문장 그대로 인용"
    }
  ],
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
      try {
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
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "";
        let userError: string;
        if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("Too Many")) {
          userError = "API 호출 한도를 초과했어요. 잠시 후 다시 시도해주세요 (무료 티어: 일 20회).";
        } else if (errorMsg.includes("404") || errorMsg.includes("not_found")) {
          userError = "AI 모델을 찾을 수 없어요. API 설정을 확인해주세요.";
        } else if (errorMsg.includes("401") || errorMsg.includes("auth") || errorMsg.includes("key")) {
          userError = "API 인증에 실패했어요. API 키를 확인해주세요.";
        } else if (errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT")) {
          userError = "AI 응답 시간이 초과됐어요. 다시 시도해주세요.";
        } else if (errorMsg.includes("high demand") || errorMsg.includes("overloaded") || errorMsg.includes("503")) {
          userError = "AI 서버가 일시적으로 과부하 상태예요. 잠시 후 다시 시도해주세요.";
        } else {
          userError = `AI 분석 중 오류: ${errorMsg || "알 수 없는 오류"}`;
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: userError })}\n\n`)
        );
      }
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
