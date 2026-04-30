import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 동점 그룹 내에서만 랜덤 셔플하고 정해진 개수만 반환
function pickWithTieBreak<T>(items: T[], keyFn: (item: T) => number | string, count: number): T[] {
  const groups = new Map<number | string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  });
  const result: T[] = [];
  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    for (const item of group) {
      if (result.length >= count) return result;
      result.push(item);
    }
  }
  return result;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: stats } = await supabase
    .from("user_stats")
    .select("level, current_eqs")
    .eq("user_id", user.id)
    .single();

  const userLevel = stats?.level || 1;

  const POOL_SIZE = 30;

  const { data: dormantPool } = await supabase
    .from("expressions")
    .select("expression, meaning, usage_count, status, last_used_at")
    .eq("user_id", user.id)
    .in("status", ["dormant", "forgotten"])
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(POOL_SIZE);

  const { data: lowUsagePool } = await supabase
    .from("expressions")
    .select("expression, meaning, usage_count, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("usage_count", { ascending: true })
    .limit(POOL_SIZE);

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

  const { data: levelBasedPool } = await supabase
    .from("recommended_content")
    .select("content, meaning, difficulty")
    .eq("user_id", user.id)
    .eq("is_saved", false)
    .in("difficulty", targetDifficulty)
    .limit(POOL_SIZE);

  const suggestions: {
    type: "expression";
    emoji: string;
    title: string;
    description: string;
  }[] = [];

  const exprSlots = 3;

  // dormant: last_used_at ASC (nulls first) + 동점 랜덤
  // lowUsage: usage_count ASC + 동점 랜덤
  const expressionsPool = dormantPool?.length
    ? pickWithTieBreak(
        dormantPool,
        (e) => e.last_used_at ?? "",
        exprSlots
      )
    : pickWithTieBreak(lowUsagePool || [], (e) => e.usage_count ?? 0, exprSlots);

  for (const e of expressionsPool) {
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

  if (suggestions.length < 3 && levelBasedPool?.length) {
    const remaining = 3 - suggestions.length;
    const picked = shuffle(levelBasedPool).slice(0, remaining);
    for (const c of picked) {
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
