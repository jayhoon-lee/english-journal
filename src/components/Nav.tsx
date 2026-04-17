"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/journal", label: "일기 작성" },
  { href: "/my-expressions", label: "내 표현" },
  { href: "/quiz", label: "퀴즈" },
  { href: "/new-content", label: "새 학습" },
  { href: "/status", label: "레벨·순위" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const isAuthPage = pathname?.startsWith("/auth");
  if (isAuthPage) return null;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/journal" className="text-lg font-bold text-blue-600">
          English Journal
        </Link>
        <div className="flex gap-1">
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
        {email && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
