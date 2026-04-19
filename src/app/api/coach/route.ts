import { createClient } from "@/lib/supabase/server";
import { getProvider, streamAIResponse } from "@/lib/ai-provider";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, chatHistory, pageContext } = await request.json();
  const provider = getProvider();

  if (provider === "mock") {
    return NextResponse.json({
      reply: "Mock 모드에서는 AI 코치를 사용할 수 없어요. AI API를 연동하면 질문에 답변해드릴 수 있어요.",
    });
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

  const { data: expressions } = await supabase
    .from("expressions")
    .select("expression, meaning")
    .eq("user_id", user.id)
    .limit(10);

  const userName = user.email?.split("@")[0] || "";

  const systemPrompt = `당신은 "${userName}"의 개인 영어 코치입니다. 항상 친근하고 격려하는 톤으로 한국어로 대화하세요.

사용자 정보:
- 레벨: ${stats?.level || 1} (영어 실력 점수: ${stats?.current_eqs || 0})
- 주요 실수 패턴: ${JSON.stringify(patterns?.map(p => p.pattern_name) || [])}
- 학습 중인 표현: ${JSON.stringify(expressions?.map(e => `${e.expression} (${e.meaning})`) || [])}

${pageContext ? `현재 사용자가 보고 있는 페이지 컨텍스트:\n${pageContext}` : ""}

규칙:
1. 영어 학습에 관한 질문에 친절하게 답변하세요.
2. 예문을 들 때는 사용자 수준에 맞춰주세요.
3. 사용자의 실수 패턴을 알고 있으니, 관련 질문이면 맞춤 조언을 해주세요.
4. 짧고 핵심적으로 답변하되, 필요하면 예문을 포함하세요.
5. 사용자가 이미 학습 중인 표현에 대해 질문하면, "이전에도 학습하신 표현이에요!"라고 상기시켜주세요.
6. 답변에서 유용한 영어 표현을 설명했다면, 답변 맨 끝에 다음 형식으로 추가하세요:
   ===EXPRESSIONS===
   표현1 | 한글뜻1 | 예문1 (영어)
   표현2 | 한글뜻2 | 예문2 (영어)
   ===END===
   이 표현들은 자동으로 사용자의 학습 목록에 저장됩니다.
7. 이미 학습 중인 표현이면 EXPRESSIONS 블록에 포함하지 마세요.
8. 예문 선택 우선순위:
   (1) 현재 보고 있는 아티클/일기에 해당 표현이 포함되어 있으면, 그 문장을 그대로 예문으로 사용
   (2) 사용자가 대화 중 예문을 직접 제시하면, 그것을 예문으로 사용
   (3) 위 두 경우가 아니면, 사용자 수준에 맞는 일반 예문 작성`;

  const conversationText = [
    ...(chatHistory || []).map((m: { role: string; content: string }) =>
      `${m.role === "user" ? "사용자" : "코치"}: ${m.content}`
    ),
    `사용자: ${message}`,
  ].join("\n\n");

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const fullText = await streamAIResponse(
          systemPrompt,
          conversationText,
          (chunk) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }
        );

        // EXPRESSIONS 블록 파싱 및 저장
        let reply = fullText;
        const savedExpressions: string[] = [];
        const exprMatch = fullText.match(/===EXPRESSIONS===\s*([\s\S]*?)\s*===END===/);
        if (exprMatch) {
          reply = fullText.replace(/===EXPRESSIONS===[\s\S]*===END===/, "").trim();
          const lines = exprMatch[1].trim().split("\n").filter(l => l.includes("|"));
          for (const line of lines) {
            const parts = line.split("|").map(s => s.trim());
            const expr = parts[0];
            const meaning = parts[1];
            const example = parts[2] || null;
            if (expr && meaning) {
              const { data: existing } = await supabase
                .from("expressions")
                .select("id")
                .eq("user_id", user.id)
                .eq("expression", expr)
                .single();

              if (!existing) {
                await supabase.from("expressions").insert({
                  user_id: user.id,
                  expression: expr,
                  meaning,
                  example_sentence: example,
                  usage_count: 0,
                  status: "active",
                });
                savedExpressions.push(expr);
              }
            }
          }
        }

        if (savedExpressions.length > 0) {
          reply += `\n\n📚 "${savedExpressions.join('", "')}" 표현이 내 학습 목록에 자동 저장되었어요!`;
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, reply })}\n\n`)
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "";
        const isQuota = errorMsg.includes("429") || errorMsg.includes("quota");
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            done: true,
            reply: isQuota
              ? "API 호출 한도를 초과했어요. 잠시 후 다시 질문해주세요 🙏"
              : "오류가 발생했어요. 다시 시도해주세요.",
          })}\n\n`)
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
