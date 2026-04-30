"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    YG?: {
      Widget: new (
        elementId: string,
        config: {
          width?: number;
          height?: number;
          components?: number;
          events?: {
            onFetchDone?: (event: { totalResult: number }) => void;
            onVideoChange?: () => void;
            onCaptionConsumed?: () => void;
          };
        }
      ) => {
        fetch: (query: string, language?: string) => void;
      };
    };
    onYouglishAPIReady?: () => void;
  }
}

interface YouGlishModalProps {
  query: string | null;
  onClose: () => void;
}

export default function YouGlishModal({ query, onClose }: YouGlishModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<ReturnType<NonNullable<typeof window.YG>["Widget"]["prototype"]["constructor"]> | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [totalResults, setTotalResults] = useState<number | null>(null);

  // 스크립트 로드
  useEffect(() => {
    if (!query) return;

    if (window.YG) {
      setScriptLoaded(true);
      return;
    }

    const existing = document.getElementById("youglish-api");
    if (existing) {
      const check = setInterval(() => {
        if (window.YG) {
          setScriptLoaded(true);
          clearInterval(check);
        }
      }, 100);
      return () => clearInterval(check);
    }

    const script = document.createElement("script");
    script.id = "youglish-api";
    script.src = "https://youglish.com/public/emb/widget.js";
    script.async = true;

    window.onYouglishAPIReady = () => {
      setScriptLoaded(true);
    };

    document.body.appendChild(script);
  }, [query]);

  // 위젯 초기화 + 검색
  useEffect(() => {
    if (!query || !scriptLoaded || !window.YG || !containerRef.current) return;

    setTotalResults(null);

    if (!widgetRef.current) {
      widgetRef.current = new window.YG.Widget("yg-widget-container", {
        width: 640,
        height: 480,
        components: 9,
        events: {
          onFetchDone: (event) => {
            setTotalResults(event.totalResult);
          },
        },
      });
    }

    widgetRef.current.fetch(query, "english");
  }, [query, scriptLoaded]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!query) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [query, onClose]);

  if (!query) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold text-gray-800">
              🎬 YouTube에서 듣기: <span className="text-blue-600">{query}</span>
            </h3>
            {totalResults !== null && (
              <p className="text-xs text-gray-500 mt-0.5">
                {totalResults > 0 ? `${totalResults.toLocaleString()}개 클립 발견` : "클립을 찾을 수 없어요"}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="p-4 bg-gray-50">
          <div ref={containerRef} className="flex justify-center">
            <div id="yg-widget-container" />
          </div>
          {!scriptLoaded && (
            <p className="text-center text-sm text-gray-400 py-12">YouGlish 위젯 로딩 중...</p>
          )}
        </div>
        <div className="px-4 py-2 border-t text-[10px] text-gray-400 text-center">
          Powered by YouGlish · 실제 YouTube 영상에서 이 표현이 발화되는 구간이 재생됩니다
        </div>
      </div>
    </div>
  );
}
