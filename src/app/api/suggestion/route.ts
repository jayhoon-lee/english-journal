import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ suggestions: [] });
  }

  // 1. Active 실수 패턴 확인
  const { data: mistakes } = await supabase
    .from("mistake_patterns")
    .select("pattern_name, rule, examples, count")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("count", { ascending: false })
    .limit(2);

  // 2. 사용자 레벨 확인
  const { data: stats } = await supabase
    .from("user_stats")
    .select("level, current_eqs")
    .eq("user_id", user.id)
    .single();

  const userLevel = stats?.level || 1;

  // 3. Dormant/Forgotten 표현 확인
  const { data: dormantExpressions } = await supabase
    .from("expressions")
    .select("expression, meaning, usage_count, status")
    .eq("user_id", user.id)
    .in("status", ["dormant", "forgotten"])
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(2);

  // 4. Active 표현 중 usage_count 낮은 것
  const { data: lowUsageExpressions } = await supabase
    .from("expressions")
    .select("expression, meaning, usage_count, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("usage_count", { ascending: true })
    .limit(2);

  // 5. 사용자 수준에 맞는 추천 콘텐츠 (아직 저장 안 한 것)
  const difficultyMap: Record<number, string[]> = {
    1: ["easy"],
    2: ["easy"],
    3: ["easy", "intermediate"],
    4: ["intermediate"],
    5: ["intermediate"],
    6: ["intermediate", "advanced"],
    7: ["advanced"],
    8: ["advanced"],
    9: ["advanced"],
  };
  const targetDifficulty = difficultyMap[userLevel] || ["intermediate"];

  const { data: levelBasedContent } = await supabase
    .from("recommended_content")
    .select("content, meaning, difficulty")
    .eq("user_id", user.id)
    .eq("is_saved", false)
    .in("difficulty", targetDifficulty)
    .limit(2);

  const suggestions: {
    type: "mistake" | "expression";
    emoji: string;
    title: string;
    description: string;
    example?: string;
  }[] = [];

  // 실수 패턴 추가 (실제 예시 포함)
  if (mistakes?.length) {
    for (const m of mistakes) {
      const lastExample = m.examples?.length ? m.examples[m.examples.length - 1] : null;
      suggestions.push({
        type: "mistake",
        emoji: "⚠️",
        title: m.pattern_name,
        description: `${m.count}회 반복 — ${m.rule || "주의가 필요해요."}`,
        example: lastExample || undefined,
      });
    }
  }

  // 표현 추가 (실수가 적으면 더 많이)
  const exprSlots = Math.max(1, 3 - suggestions.length);

  // 우선순위: 잊혀가는 표현 > 덜 익숙한 표현 > 수준별 추천 콘텐츠
  const expressionsToShow = dormantExpressions?.length
    ? dormantExpressions
    : lowUsageExpressions || [];

  for (const e of expressionsToShow.slice(0, exprSlots)) {
    const statusLabel =
      e.status === "forgotten" ? "오랫동안 안 쓴" :
      e.status === "dormant" ? "잊혀가는" : "아직 덜 익숙한";

    suggestions.push({
      type: "expression",
      emoji: "💡",
      title: e.expression,
      description: `${e.meaning} — ${statusLabel} 표현이에요. 오늘 일기에 써보세요!`,
    });
  }

  // 기존 표현이 부족하면 수준에 맞는 추천 콘텐츠 표시
  if (suggestions.length < 3 && levelBasedContent?.length) {
    for (const c of levelBasedContent.slice(0, 3 - suggestions.length)) {
      const levelLabel = c.difficulty === "easy" ? "기초" : c.difficulty === "advanced" ? "고급" : "중급";
      suggestions.push({
        type: "expression",
        emoji: "🎯",
        title: c.content,
        description: `${c.meaning} — Lv.${userLevel}에 맞는 ${levelLabel} 표현이에요!`,
      });
    }
  }

  return NextResponse.json({ suggestions });
}
