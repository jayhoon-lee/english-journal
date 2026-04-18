export function generateMockFeedback(text: string) {
  const wordCount = text.split(/\s+/).length;
  const corrected = text
    .replace(/\bi\b/g, "I")
    .replace(/dont/g, "don't")
    .replace(/im\b/gi, "I'm")
    .replace(/cant/g, "can't")
    .replace(/wont/g, "won't");

  const mistakes: {
    pattern_name: string;
    original: string;
    corrected: string;
    rule: string;
    is_new_pattern: boolean;
  }[] = [];

  if (/\bi\b/.test(text)) {
    const match = text.match(/.{0,10}\bi\b.{0,10}/);
    if (match) {
      mistakes.push({
        pattern_name: "대문자 I 누락",
        original: match[0].trim(),
        corrected: match[0].trim().replace(/\bi\b/, "I"),
        rule: "1인칭 대명사 'I'는 항상 대문자로 씁니다.",
        is_new_pattern: true,
      });
    }
  }

  if (/dont|cant|wont/.test(text)) {
    const match = text.match(/.{0,10}(dont|cant|wont).{0,10}/);
    if (match) {
      const word = match[1];
      const fixed = word === "dont" ? "don't" : word === "cant" ? "can't" : "won't";
      mistakes.push({
        pattern_name: "축약형 어포스트로피 누락",
        original: match[0].trim(),
        corrected: match[0].trim().replace(word, fixed),
        rule: `축약형에는 어포스트로피가 필요합니다: ${word} → ${fixed}`,
        is_new_pattern: true,
      });
    }
  }

  if (mistakes.length === 0) {
    mistakes.push({
      pattern_name: "Mock 모드",
      original: text.slice(0, 30),
      corrected: text.slice(0, 30),
      rule: "실제 AI 연동 시 정확한 실수 분석이 제공됩니다.",
      is_new_pattern: false,
    });
  }

  return {
    corrected_text: corrected,
    mistakes,
    used_expressions: [],
    scoring: {
      vocabulary_score: Math.min(100, 40 + wordCount * 2),
      grammar_score: Math.min(100, 45 + wordCount),
      expression_score: Math.min(100, 35 + wordCount),
      accuracy_score: Math.min(100, 50 + wordCount),
      eqs: Math.min(100, 43 + Math.floor(wordCount / 2)),
      vocab_level: wordCount > 50 ? "B1" : "A2",
      scoring_reason: {
        vocabulary: "사용된 어휘 수준을 분석했습니다.",
        grammar: "문법 구조를 분석했습니다.",
        expression: "사용된 표현의 다양성을 평가했습니다.",
        accuracy: "전체적인 정확도를 평가했습니다.",
      },
    },
    feedback_summary:
      "Mock 모드로 동작 중입니다. AI API를 연동하면 실제 일기 내용에 맞는 상세한 피드백이 제공됩니다.",
  };
}
