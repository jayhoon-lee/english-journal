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

  const { originalText, feedback, chatHistory, message } = await request.json();
  const provider = getProvider();

  if (provider === "mock") {
    return NextResponse.json({
      reply: "Mock 모드에서는 Q&A가 지원되지 않습니다. AI API를 연동하면 사용할 수 있어요.",
      updatedFeedback: null,
    });
  }

  const systemPrompt = `당신은 영어 코치입니다. 사용자가 영어 일기를 쓰고 AI 피드백을 받은 후, 피드백에 대해 질문하거나 이의를 제기하고 있습니다.

[사용자의 원문]
${originalText}

[AI가 제공한 피드백]
${JSON.stringify(feedback)}

규칙:
1. 사용자의 질문에 친절하고 명확하게 한국어로 답변하세요.
2. 사용자가 교정에 이의를 제기하면, 타당한 경우 "맞아요, 그 표현도 자연스럽습니다"라고 인정하세요.
3. 사용자의 의견이 타당하여 분석을 수정해야 하는 경우, 답변 끝에 다음 JSON 블록을 추가하세요:
   ===UPDATED_FEEDBACK===
   {수정된 전체 feedback JSON}
   ===END_FEEDBACK===
4. 분석 수정이 필요 없으면 JSON 블록 없이 텍스트 답변만 하세요.
5. 왜 특정 표현이 더 좋은지, 뉘앙스 차이, 원어민이 실제 쓰는 표현 등을 설명해주세요.`;

  const messages = [
    ...(chatHistory || []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const fullText = await streamAIResponse(
        systemPrompt,
        messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n\n"),
        (chunk) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }
      );

      let reply = fullText;
      let updatedFeedback = null;

      const feedbackMatch = fullText.match(/===UPDATED_FEEDBACK===\s*([\s\S]*?)\s*===END_FEEDBACK===/);
      if (feedbackMatch) {
        reply = fullText.replace(/===UPDATED_FEEDBACK===[\s\S]*===END_FEEDBACK===/, "").trim();
        try {
          const cleaned = feedbackMatch[1]
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
          updatedFeedback = JSON.parse(cleaned);
        } catch {}
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true, reply, updatedFeedback })}\n\n`)
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
