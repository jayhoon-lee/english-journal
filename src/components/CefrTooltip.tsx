"use client";

import { useState } from "react";

const cefrData: Record<string, {
  label: string;
  description: string;
  toeic: string;
  toefl: string;
  ielts: string;
  teps: string;
}> = {
  A1: {
    label: "입문",
    description: "기초적인 인사, 자기소개, 간단한 질문 이해",
    toeic: "120 이하",
    toefl: "-",
    ielts: "-",
    teps: "241 이하",
  },
  A2: {
    label: "초급",
    description: "간단한 일상 대화, 기본적인 정보 교환",
    toeic: "225~549",
    toefl: "~56",
    ielts: "3.0~3.5",
    teps: "242~354",
  },
  B1: {
    label: "중급",
    description: "일상 주제 소통 가능, 여행/학교/직장에서 대처",
    toeic: "550~784",
    toefl: "57~86",
    ielts: "4.0~5.0",
    teps: "355~451",
  },
  B2: {
    label: "중상급",
    description: "복잡한 주제 토론 가능, 원어민과 자연스러운 대화",
    toeic: "785~944",
    toefl: "87~109",
    ielts: "5.5~6.5",
    teps: "452~555",
  },
  C1: {
    label: "고급",
    description: "유창하고 자연스러운 표현, 학술/업무 활용",
    toeic: "945~989",
    toefl: "110~120",
    ielts: "7.0~8.0",
    teps: "556~625",
  },
  C2: {
    label: "원어민급",
    description: "거의 모든 상황에서 완벽한 이해와 표현",
    toeic: "990",
    toefl: "120",
    ielts: "8.5~9.0",
    teps: "626+",
  },
};

export default function CefrTooltip({ level }: { level: string }) {
  const [show, setShow] = useState(false);
  const data = cefrData[level];

  if (!data) return <span>{level}</span>;

  return (
    <span
      className="relative inline-block cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      <span className="font-semibold border-b border-dashed border-gray-400">
        CEFR {level} ({data.label})
      </span>

      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-white rounded-xl shadow-lg border p-4 z-50 text-left">
          <div className="text-sm font-bold text-gray-800 mb-1">
            CEFR {level} — {data.label}
          </div>
          <p className="text-xs text-gray-500 mb-3">{data.description}</p>

          <div className="text-xs font-medium text-gray-400 mb-1.5">다른 시험 환산</div>
          <table className="w-full text-xs">
            <tbody>
              {[
                { name: "TOEIC", value: data.toeic },
                { name: "TOEFL iBT", value: data.toefl },
                { name: "IELTS", value: data.ielts },
                { name: "TEPS", value: data.teps },
              ].map(({ name, value }) => (
                <tr key={name} className="border-t border-gray-50">
                  <td className="py-1 text-gray-500">{name}</td>
                  <td className="py-1 text-right font-semibold text-gray-700">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
            <div className="w-2 h-2 bg-white border-r border-b rotate-45 -mt-1"></div>
          </div>
        </div>
      )}
    </span>
  );
}
