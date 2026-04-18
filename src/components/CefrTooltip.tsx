"use client";

import { useState, useRef, useEffect } from "react";

const cefrData: Record<string, {
  label: string;
  description: string;
  toeic: string;
  toefl: string;
  ielts: string;
  teps: string;
  opic: string;
}> = {
  A1: {
    label: "입문",
    description: "기초적인 인사, 자기소개, 간단한 질문 이해",
    toeic: "120 이하",
    toefl: "-",
    ielts: "-",
    teps: "241 이하",
    opic: "NL~NM",
  },
  A2: {
    label: "초급",
    description: "간단한 일상 대화, 기본적인 정보 교환",
    toeic: "225~549",
    toefl: "~56",
    ielts: "3.0~3.5",
    teps: "242~354",
    opic: "NH~IL",
  },
  B1: {
    label: "중급",
    description: "일상 주제 소통 가능, 여행/학교/직장에서 대처",
    toeic: "550~784",
    toefl: "57~86",
    ielts: "4.0~5.0",
    teps: "355~451",
    opic: "IM1~IM3",
  },
  B2: {
    label: "중상급",
    description: "복잡한 주제 토론 가능, 원어민과 자연스러운 대화",
    toeic: "785~944",
    toefl: "87~109",
    ielts: "5.5~6.5",
    teps: "452~555",
    opic: "IH",
  },
  C1: {
    label: "고급",
    description: "유창하고 자연스러운 표현, 학술/업무 활용",
    toeic: "945~989",
    toefl: "110~120",
    ielts: "7.0~8.0",
    teps: "556~625",
    opic: "AL",
  },
  C2: {
    label: "원어민급",
    description: "거의 모든 상황에서 완벽한 이해와 표현",
    toeic: "990",
    toefl: "120",
    ielts: "8.5~9.0",
    teps: "626+",
    opic: "AL",
  },
};

export default function CefrTooltip({ level }: { level: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const data = cefrData[level];

  useEffect(() => {
    if (!show) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [show]);

  if (!data) return <span>{level}</span>;

  return (
    <span
      ref={ref}
      className="relative inline-block cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShow(!show);
      }}
    >
      <span className="font-semibold border-b border-dashed border-gray-400 hover:text-blue-600 transition-colors">
        CEFR {level} ({data.label})
      </span>

      {show && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 sm:bg-transparent sm:absolute sm:inset-auto sm:top-full sm:left-1/2 sm:-translate-x-1/2 sm:mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-80 bg-white rounded-xl shadow-xl border p-5 text-left relative">
            <button
              onClick={() => setShow(false)}
              className="absolute top-2 right-3 text-gray-300 hover:text-gray-500 text-lg sm:hidden"
            >
              ✕
            </button>

            <div className="text-base font-bold text-gray-800 mb-1">
              CEFR {level} — {data.label}
            </div>
            <p className="text-sm text-gray-500 mb-4">{data.description}</p>

            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">다른 시험 환산</div>
            <table className="w-full text-sm">
              <tbody>
                {[
                  { name: "TOEIC", value: data.toeic },
                  { name: "TOEFL iBT", value: data.toefl },
                  { name: "IELTS", value: data.ielts },
                  { name: "TEPS", value: data.teps },
                  { name: "OPIc", value: data.opic },
                ].map(({ name, value }) => (
                  <tr key={name} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-500">{name}</td>
                    <td className="py-1.5 text-right font-semibold text-gray-700">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 pt-2 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1.5">전체 CEFR 레벨</div>
              <div className="flex gap-1">
                {Object.entries(cefrData).map(([lv, d]) => (
                  <div
                    key={lv}
                    className={`flex-1 text-center py-1 rounded text-xs font-medium ${
                      lv === level
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {lv}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
