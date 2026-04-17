"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface UserStats {
  current_eqs: number;
  level: number;
  global_rank: number | null;
  weekly_rank: number | null;
  weekly_eqs_gain: number;
  total_entries: number;
  current_streak: number;
  longest_streak: number;
}

interface ScoreHistory {
  date: string;
  eqs: number;
  vocabulary_score: number;
  grammar_score: number;
  expression_score: number;
  accuracy_score: number;
}

const levels = [
  { lv: 1, emoji: "🌱", name: "Beginner", min: 0 },
  { lv: 2, emoji: "📖", name: "Elementary", min: 20 },
  { lv: 3, emoji: "💬", name: "Pre-Inter", min: 35 },
  { lv: 4, emoji: "🗣️", name: "Intermediate", min: 48 },
  { lv: 5, emoji: "⚡", name: "Upper-Inter", min: 60 },
  { lv: 6, emoji: "🎯", name: "Advanced", min: 72 },
  { lv: 7, emoji: "📰", name: "Proficient", min: 82 },
  { lv: 8, emoji: "🏆", name: "Expert", min: 90 },
  { lv: 9, emoji: "👑", name: "Master", min: 96 },
];

export default function StatusPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<ScoreHistory[]>([]);
  const [latestScores, setLatestScores] = useState<ScoreHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [statsRes, scoresRes] = await Promise.all([
      supabase.from("user_stats").select("*").single(),
      supabase
        .from("entry_scores")
        .select("vocabulary_score, grammar_score, expression_score, accuracy_score, eqs, scored_at")
        .order("scored_at", { ascending: true })
        .limit(30),
    ]);

    setStats(statsRes.data);

    const scores = (scoresRes.data || []).map((s) => ({
      date: new Date(s.scored_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
      eqs: s.eqs || 0,
      vocabulary_score: s.vocabulary_score || 0,
      grammar_score: s.grammar_score || 0,
      expression_score: s.expression_score || 0,
      accuracy_score: s.accuracy_score || 0,
    }));

    setHistory(scores);
    if (scores.length > 0) setLatestScores(scores[scores.length - 1]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">레벨·순위</h1>
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      </div>
    );
  }

  const currentLevel = levels.find((l) => l.lv === (stats?.level || 1)) || levels[0];
  const nextLevel = levels.find((l) => l.lv === (stats?.level || 1) + 1);
  const progress = nextLevel
    ? ((stats?.current_eqs || 0) - currentLevel.min) / (nextLevel.min - currentLevel.min) * 100
    : 100;

  const radarData = latestScores
    ? [
        { subject: "어휘", score: latestScores.vocabulary_score },
        { subject: "문법", score: latestScores.grammar_score },
        { subject: "표현", score: latestScores.expression_score },
        { subject: "정확도", score: latestScores.accuracy_score },
      ]
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">레벨·순위</h1>

      {/* 레벨 + EQS */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl">{currentLevel.emoji}</span>
          <div>
            <div className="text-sm text-gray-500">Lv.{currentLevel.lv}</div>
            <div className="text-xl font-bold">{currentLevel.name}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-sm text-gray-500">EQS</div>
            <div className="text-3xl font-bold text-blue-600">{stats?.current_eqs || 0}</div>
          </div>
        </div>

        {/* 프로그레스 바 */}
        <div className="relative">
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          {nextLevel && (
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{currentLevel.min}</span>
              <span>다음: {nextLevel.emoji} {nextLevel.name} ({nextLevel.min})</span>
            </div>
          )}
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-sm text-gray-500">총 일기</div>
          <div className="text-2xl font-bold">{stats?.total_entries || 0}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-sm text-gray-500">연속 작성</div>
          <div className="text-2xl font-bold">{stats?.current_streak || 0}일</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-sm text-gray-500">최장 스트릭</div>
          <div className="text-2xl font-bold">{stats?.longest_streak || 0}일</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-sm text-gray-500">주간 성장</div>
          <div className="text-2xl font-bold text-green-600">
            +{stats?.weekly_eqs_gain || 0}
          </div>
        </div>
      </div>

      {/* 4축 레이더 차트 */}
      {radarData.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">능력치 레이더</h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis domain={[0, 100]} />
              <Radar
                dataKey="score"
                stroke="#2563eb"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* EQS 추이 라인 차트 */}
      {history.length > 1 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">EQS 성장 곡선</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="eqs"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: "#2563eb", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
