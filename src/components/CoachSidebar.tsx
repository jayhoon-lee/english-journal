"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function CoachSidebar() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isAuthPage = pathname?.startsWith("/auth");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const pageContext = getPageContext();

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          chatHistory: messages,
          pageContext,
        }),
      });

      if (!res.ok) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "오류가 발생했어요. 잠시 후 다시 시도해주세요 🙏",
          };
          return updated;
        });
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: data.reply };
                return updated;
              });
              if (data.savedExpressions?.length > 0 || data.expressionsChanged) {
                window.dispatchEvent(new CustomEvent("expressions-updated"));
              }
            } else if (data.text) {
              streamedText += data.text;
              const displayText = streamedText
                .replace(/===EXPRESSIONS===[\s\S]*/g, "")
                .trim();
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: displayText };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "네트워크 오류가 발생했어요. 인터넷 연결을 확인해주세요.",
        };
        return updated;
      });
    }

    setLoading(false);
  }

  function getPageContext(): string {
    const baseContexts: Record<string, string> = {
      "/journal": "사용자가 영어 일기를 작성하거나 기록을 보고 있습니다.",
      "/my-expressions": "사용자가 실수 패턴(Watch List)이나 학습 표현(Keep List)을 관리하고 있습니다.",
      "/quiz": "사용자가 퀴즈를 풀고 있습니다.",
      "/new-content": "사용자가 새로운 학습 콘텐츠를 보고 있습니다.",
      "/status": "사용자가 자신의 레벨과 순위를 확인하고 있습니다.",
    };

    let context = baseContexts[pathname || ""] || "";

    // 현재 페이지에서 보이는 모든 컨텍스트 수집
    try {
      const elements = document.querySelectorAll("[data-coach-context]");
      const contexts: string[] = [];
      elements.forEach((el) => {
        const content = el.getAttribute("data-coach-context");
        if (content) contexts.push(content);
      });
      if (contexts.length > 0) {
        context += `\n\n[현재 화면에 보이는 콘텐츠]\n${contexts.join("\n\n").slice(0, 1000)}`;
      }
    } catch {}

    return context;
  }

  function clearChat() {
    setMessages([]);
  }

  if (isAuthPage) return null;

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            🧑‍🏫 AI 코치
          </h3>
          <p className="text-[10px] text-gray-400">영어 학습에 관해 무엇이든 물어보세요</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              대화 초기화
            </button>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-gray-400 hover:text-gray-600 text-lg"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <div className="text-3xl">🧑‍🏫</div>
            <p className="text-xs text-gray-400">
              영어 표현, 문법, 발음 등<br />무엇이든 물어보세요!
            </p>
            <div className="space-y-1.5">
              {[
                "이 표현이 자연스러워?",
                "비슷한 표현 알려줘",
                "오늘 뭘 공부하면 좋을까?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="block w-full text-xs px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-blue-500 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-700 rounded-bl-sm"
              }`}
            >
              {m.content ? (
                <span className="whitespace-pre-wrap">{m.content}</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-white shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="질문을 입력하세요..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-80 border-l border-gray-200 bg-white shrink-0 sticky top-14 h-[calc(100vh-3.5rem)]">
        {chatContent}
      </aside>

      {/* Mobile Toggle Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-16 right-3 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-blue-700 transition-colors safe-area-bottom"
      >
        🧑‍🏫
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative mt-auto h-[70vh] bg-white rounded-t-2xl flex flex-col safe-area-bottom">
            {chatContent}
          </div>
        </div>
      )}
    </>
  );
}
