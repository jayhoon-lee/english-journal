import { createClient } from "@/lib/supabase/server";
import { getProvider, streamAIResponse } from "@/lib/ai-provider";
import { saveExpressionDeduped } from "@/lib/expression-utils";
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
    .select("pattern_name, rule, count, consecutive_clean, status, examples")
    .eq("user_id", user.id)
    .limit(10);

  const { data: expressions } = await supabase
    .from("expressions")
    .select("expression, meaning, usage_count, status")
    .eq("user_id", user.id)
    .limit(20);

  const userName = user.email?.split("@")[0] || "";

  const statusLabel: Record<string, string> = {
    active: "반복 실수 중",
    improving: "개선 중 (연속 클린 2회+)",
    cleared: "극복 완료!",
  };
  const exprStatusLabel: Record<string, string> = {
    active: "잘 사용 중",
    dormant: "오래 안 씀 (2주+)",
    forgotten: "잊혀가는 중 (1달+)",
  };

  const patternInfo = (patterns || []).map(p =>
    `- "${p.pattern_name}": ${statusLabel[p.status] || p.status}, ${p.count}회 실수, 연속클린 ${p.consecutive_clean}회${p.examples?.length ? `, 최근 실수: "${p.examples[p.examples.length - 1]}"` : ""}`
  ).join("\n");

  const exprInfo = (expressions || []).map(e =>
    `- "${e.expression}" (${e.meaning}): ${e.usage_count === 0 ? "아직 미사용" : `${e.usage_count}회 사용`}, 상태: ${e.usage_count === 0 ? "미사용" : (exprStatusLabel[e.status] || e.status)}`
  ).join("\n");

  const systemPrompt = `당신은 "${userName}"의 개인 영어 코치입니다. 항상 친근하고 격려하는 톤으로 한국어로 대화하세요.

사용자 정보:
- 레벨: ${stats?.level || 1} (영어 실력 점수: ${stats?.current_eqs || 0})

[사용자의 실수 패턴 관리 현황]
${patternInfo || "없음"}

[사용자의 학습 표현 관리 현황]
${exprInfo || "없음"}

${pageContext ? `현재 사용자가 보고 있는 페이지 컨텍스트:\n${pageContext}` : ""}

규칙:
1. 영어 학습에 관한 질문에 친절하게 답변하세요.
2. 예문을 들 때는 사용자 수준에 맞춰주세요.
3. 사용자의 실수 패턴을 알고 있으니, 관련 질문이면 맞춤 조언을 해주세요.
4. 짧고 핵심적으로 답변하되, 필요하면 예문을 포함하세요.
5. 사용자가 이미 관리 중인 표현/실수에 대해 물어보면, 현재 관리 상태를 알려주세요. 예:
   - "이 표현은 이미 학습 목록에 있고, 3회 사용하셨어요! 잘하고 계세요 🔥"
   - "이 표현은 아직 한 번도 안 쓰셨네요. 오늘 일기에 써보는 건 어때요?"
   - "이 실수는 2회 반복되고 있어요. 최근에 'preasured'라고 쓰셨는데, 'pressured'가 맞아요."
   - "이 실수는 개선 중이에요! 연속 2회 안 틀리고 있어요. 조금만 더 힘내세요! 🟡"
9. 사용자가 영어 단어나 표현만 입력하면 (예: "push back on", "vibrant"), 다음을 해주세요:
   - 뜻과 사용법을 간단히 설명
   - 사용자 수준에 맞는 예문 제공
   - EXPRESSIONS 블록에 포함하여 자동 저장
   - "기억해둘게요! 앞으로 일기에서 사용해보세요 😊" 라고 격려
6. 답변에서 유용한 영어 표현을 설명했다면, 답변 맨 끝에 다음 형식으로 추가하세요:
   ===EXPRESSIONS===
   표현1 | 사전적 한글뜻1 | 예문1 (영어)
   표현2 | 사전적 한글뜻2 | 예문2 (영어)
   ===END===
   이 표현들은 자동으로 사용자의 학습 목록에 저장됩니다.
   **한글뜻은 반드시 사전적 의미만 적으세요. 문맥상 의역/부정/시제 변형 금지.**
   - 예: "barely" → "거의 ~ 않다" (O), "거의 멈추지 않았다" (X)
   - 예: "look forward to" → "~을 기대하다" (O), "그것을 기대했다" (X)
   - 한글뜻에 주어/목적어/시제 정보 절대 포함 금지
7. 이미 학습 중인 표현이면 EXPRESSIONS 블록에 포함하지 마세요.
8. 예문 선택 우선순위:
   (1) 현재 보고 있는 아티클/일기에 해당 표현이 포함되어 있으면, 그 문장을 그대로 예문으로 사용
   (2) 사용자가 대화 중 예문을 직접 제시하면, 그것을 예문으로 사용
   (3) 위 두 경우가 아니면, 사용자 수준에 맞는 일반 예문 작성`;

  // 사용자 메시지가 기존 표현/실수와 매칭되는지 확인 → usage_count 감소
  const messageLower = message.toLowerCase().trim();
  const askedAgainExprs: string[] = [];

  for (const e of expressions || []) {
    if (messageLower.includes(e.expression.toLowerCase()) || e.expression.toLowerCase().includes(messageLower)) {
      if (messageLower.length >= 3) {
        const newCount = (e.usage_count || 0) - 1;
        await supabase
          .from("expressions")
          .update({ usage_count: newCount })
          .eq("user_id", user.id)
          .eq("expression", e.expression);
        askedAgainExprs.push(e.expression);
      }
    }
  }

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
              const result = await saveExpressionDeduped(
                supabase, user.id, expr, meaning, example, "coach"
              );
              if (result.saved) {
                savedExpressions.push(expr);
              } else if (result.merged) {
                savedExpressions.push(`${expr} (기존 표현에 병합)`);
              }
            }
          }
        }

        if (savedExpressions.length > 0) {
          reply += `\n\n📚 "${savedExpressions.join('", "')}" 표현이 내 학습 목록에 자동 저장되었어요!`;
        }

        if (askedAgainExprs.length > 0 && savedExpressions.length === 0) {
          reply += `\n\n📉 "${askedAgainExprs.join('", "')}" — 다시 물어보셨으니 복습 우선순위를 올렸어요. 일기에서 직접 써보면 다시 올라가요!`;
        }

        const expressionsChanged = savedExpressions.length > 0 || askedAgainExprs.length > 0;

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, reply, savedExpressions, expressionsChanged })}\n\n`)
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
