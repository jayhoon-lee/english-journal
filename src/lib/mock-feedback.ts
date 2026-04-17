export function generateMockFeedback(text: string) {
  const wordCount = text.split(/\s+/).length;
  const hasErrors = text.toLowerCase() !== text;

  return {
    corrected_text: text.replace(/i /g, "I ").replace(/dont/g, "don't").replace(/im /g, "I'm "),
    mistakes: [
      {
        pattern_name: "관사 누락",
        original: "I went to store",
        corrected: "I went to the store",
        rule: "특정한 장소를 가리킬 때는 정관사 'the'를 사용합니다.",
        is_new_pattern: true,
      },
      {
        pattern_name: "시제 불일치",
        original: "Yesterday I go",
        corrected: "Yesterday I went",
        rule: "과거를 나타내는 부사(yesterday)와 함께 과거 시제를 사용합니다.",
        is_new_pattern: false,
      },
    ],
    used_expressions: ["get things done", "on the other hand"],
    scoring: {
      vocabulary_score: Math.min(100, 40 + wordCount * 2),
      grammar_score: 55,
      expression_score: Math.min(100, 35 + wordCount),
      accuracy_score: 60,
      eqs: Math.min(100, 48 + Math.floor(wordCount / 2)),
      vocab_level: wordCount > 50 ? "B1" : "A2",
      scoring_reason: {
        vocabulary: "기본적인 일상 어휘를 사용했습니다. 좀 더 다양한 표현을 시도해보세요.",
        grammar: "과거 시제와 관사 사용에 주의가 필요합니다.",
        expression: "학습한 표현을 일부 활용했습니다.",
        accuracy: "문법적 오류가 일부 발견되었습니다.",
      },
    },
    feedback_summary:
      "전반적으로 일상을 잘 표현하고 있지만, 관사와 시제 사용에 좀 더 신경 쓰면 좋겠습니다. 학습한 표현을 적극 활용한 점은 좋습니다!",
  };
}
