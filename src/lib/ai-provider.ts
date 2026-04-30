type AIProvider = "claude" | "gemini" | "mock";

export function getProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GOOGLE_AI_API_KEY) return "gemini";
  return "mock";
}

export async function generateAIResponse(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number }
): Promise<string> {
  const provider = getProvider();

  if (provider === "claude") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    return message.content[0].type === "text" ? message.content[0].text : "";
  }

  if (provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
      systemInstruction: systemPrompt,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      ...(options?.temperature !== undefined
        ? { generationConfig: { temperature: options.temperature } }
        : {}),
    });
    return result.response.text();
  }

  return "";
}

export async function streamAIResponse(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void
): Promise<string> {
  const provider = getProvider();

  if (provider === "claude") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic();
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onChunk(event.delta.text);
      }
    }

    const finalMessage = await stream.finalMessage();
    return finalMessage.content[0].type === "text"
      ? finalMessage.content[0].text
      : "";
  }

  if (provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContentStream({
      systemInstruction: systemPrompt,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    });

    let fullText = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      onChunk(text);
    }
    return fullText;
  }

  return "";
}
