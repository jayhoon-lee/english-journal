"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/journal", label: "일기", icon: "✏️" },
  { href: "/my-expressions", label: "표현", icon: "📚" },
  { href: "/quiz", label: "퀴즈", icon: "🧩" },
  { href: "/new-content", label: "학습", icon: "🆕" },
  { href: "/status", label: "현황", icon: "📊" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [level, setLevel] = useState<number>(1);
  const [eqs, setEqs] = useState<number>(0);
  const supabase = createClient();

  const levelInfo: Record<number, { emoji: string; name: string }> = {
    1: { emoji: "🌱", name: "Beginner" },
    2: { emoji: "📖", name: "Elementary" },
    3: { emoji: "💬", name: "Pre-Inter" },
    4: { emoji: "🗣️", name: "Intermediate" },
    5: { emoji: "⚡", name: "Upper-Inter" },
    6: { emoji: "🎯", name: "Advanced" },
    7: { emoji: "📰", name: "Proficient" },
    8: { emoji: "🏆", name: "Expert" },
    9: { emoji: "👑", name: "Master" },
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });

    supabase
      .from("user_stats")
      .select("level, current_eqs")
      .single()
      .then(({ data }) => {
        if (data) {
          setLevel(data.level || 1);
          setEqs(data.current_eqs || 0);
        }
      });
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const isAuthPage = pathname?.startsWith("/auth");
  if (isAuthPage) return null;

  return (
    <>
      {/* Desktop Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/journal" className="text-lg font-bold text-blue-600 shrink-0">
            English Journal
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {email && (
              <div className="hidden md:flex items-center gap-3">
                <Link
                  href="/status"
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm">{levelInfo[level]?.emoji}</span>
                  <span className="text-xs font-semibold text-gray-700">Lv.{level}</span>
                  <span className="text-xs text-gray-400">{eqs}점</span>
                </Link>
                <span className="text-sm text-gray-500 max-w-[120px] truncate">{email.split("@")[0]}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            )}

            {/* Mobile Level Badge */}
            {email && (
              <Link
                href="/status"
                className="md:hidden flex items-center gap-1 px-2 py-0.5 bg-gray-50 rounded-full"
              >
                <span className="text-xs">{levelInfo[level]?.emoji}</span>
                <span className="text-[10px] font-semibold text-gray-700">Lv.{level}</span>
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
            {links.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{icon}</span>
                {label}
              </Link>
            ))}
            {email && (
              <div className="border-t border-gray-100 mt-2 pt-2">
                <div className="px-3 py-2 flex items-center gap-2">
                  <span>{levelInfo[level]?.emoji}</span>
                  <span className="text-sm font-medium">Lv.{level} {levelInfo[level]?.name}</span>
                  <span className="text-xs text-gray-400">실력 {eqs}점</span>
                </div>
                <div className="px-3 py-1 text-xs text-gray-400 truncate">{email}</div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
        <div className="flex justify-around items-center h-14">
          {links.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors ${
                pathname === href
                  ? "text-blue-600"
                  : "text-gray-400"
              }`}
            >
              <span className="text-lg">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
