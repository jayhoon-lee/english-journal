import { createClient } from "@/lib/supabase/server";
import { getProvider, generateAIResponse } from "@/lib/ai-provider";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ greeting: "" });
  }

  const userName = user.email?.split("@")[0] || "";
  const today = new Date().toISOString().split("T")[0];

  // 캐시 확인: 오늘 이미 생성된 인사말이 있으면 바로 반환
  const { data: stats } = await supabase
    .from("user_stats")
    .select("cached_greeting, greeting_date, current_streak, total_entries")
    .eq("user_id", user.id)
    .single();

  if (stats?.cached_greeting && stats?.greeting_date === today) {
    return NextResponse.json({ greeting: stats.cached_greeting });
  }

  const { data: lastEntry } = await supabase
    .from("journal_entries")
    .select("original_text, coach_feedback, date")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastEntry) {
    const greeting = `${userName}님, 첫 영어 일기를 써볼까요? 부담 없이 짧게 시작해도 좋아요 ✨`;
    await cacheGreeting(supabase, user.id, greeting, today);
    return NextResponse.json({ greeting });
  }

  const provider = getProvider();

  if (provider === "mock") {
    const greeting = `${userName}님, 다시 만나서 반가워요! 오늘은 어떤 이야기를 들려줄 건가요? 😊`;
    await cacheGreeting(supabase, user.id, greeting, today);
    return NextResponse.json({ greeting });
  }

  const hour = new Date().getHours();
  const timeContext = hour < 12 ? "아침" : hour < 18 ? "오후" : "저녁";
  const dayOfWeek = new Date().toLocaleDateString("ko-KR", { weekday: "long" });

  const prompt = `당신은 영어 학습 앱의 친근한 코치입니다.
사용자의 마지막 일기 내용을 참고해서, 오늘의 인사말을 한 문장으로 만들어주세요.

규칙:
- 반드시 한국어로, 1문장만 (30자~60자)
- 마지막 일기 내용을 자연스럽게 언급하거나 이어지는 느낌
- 오늘 새 일기를 쓰고 싶게 만드는 따뜻한 톤
- 이모지 1개 포함
- JSON이 아닌 순수 텍스트로만 응답`;

  const userMsg = `사용자: ${userName}
현재: ${dayOfWeek} ${timeContext}
연속 작성: ${stats?.current_streak || 0}일
총 일기: ${stats?.total_entries || 0}편
마지막 일기 내용: ${lastEntry.original_text.slice(0, 200)}
마지막 피드백: ${lastEntry.coach_feedback || "없음"}`;

  try {
    const raw = await generateAIResponse(prompt, userMsg);
    const cleaned = raw.replace(/^["']|["']$/g, "").trim();
    const greeting = `${userName}님, ${cleaned}`;
    await cacheGreeting(supabase, user.id, greeting, today);
    return NextResponse.json({ greeting });
  } catch {
    const fallback = `${userName}님, 다시 만나서 반가워요! 오늘도 함께 영어 연습해요 😊`;
    await cacheGreeting(supabase, user.id, fallback, today);
    return NextResponse.json({ greeting: fallback });
  }
}

async function cacheGreeting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  greeting: string,
  date: string
) {
  await supabase
    .from("user_stats")
    .update({ cached_greeting: greeting, greeting_date: date })
    .eq("user_id", userId);
}
