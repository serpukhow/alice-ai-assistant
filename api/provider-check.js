export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const systemInstruction = "Ты голосовой помощник Алисы. Отвечай по-русски, понятно и по существу. Учитывай предыдущие реплики и отвечай на уточнения с учетом контекста.";
  const history = [
    { role: "user", text: "Почему зимой запотевают окна автомобиля?" },
    { role: "assistant", text: "Окна запотевают из-за влажного воздуха в салоне, который соприкасается с холодным стеклом. Влага конденсируется на поверхности." },
    { role: "user", text: "А как этого избежать?" }
  ];

  const cloudflareTest = async () => {
    const startedAt = Date.now();
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/zai-org/glm-4.7-flash`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.CLOUDFLARE_AI_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemInstruction },
              ...history.map(item => ({
                role: item.role,
                content: item.text
              }))
            ],
            max_tokens: 90,
            chat_template_kwargs: { enable_thinking: false },
            stream: false
          }),
          signal: AbortSignal.timeout(3800)
        }
      );
      const data = await response.json().catch(() => null);
      const result = data?.result || {};
      const choices = result.choices || data?.choices;
      const candidates = [
        result.response,
        result.output_text,
        choices?.[0]?.message?.content,
        choices?.[0]?.text
      ];
      const answer = candidates.find(
        value => typeof value === "string" && value.trim()
      )?.trim() || "";
      const errors = Array.isArray(data?.errors)
        ? data.errors.map(item => ({
            code: item?.code,
            message: String(item?.message || "").slice(0, 160)
          }))
        : [];
      return {
        provider: "Cloudflare GLM-4.7-Flash",
        ok: response.ok && data?.success !== false && Boolean(answer),
        status: response.status,
        latency_ms: Date.now() - startedAt,
        answer: answer.slice(0, 500),
        errors
      };
    } catch (error) {
      return {
        provider: "Cloudflare GLM-4.7-Flash",
        ok: false,
        latency_ms: Date.now() - startedAt,
        error: error?.name || "Error",
        detail: String(error?.message || "").slice(0, 160)
      };
    }
  };

  const geminiTest = async () => {
    const startedAt = Date.now();
    try {
      const contents = history.map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.text }]
      }));
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              maxOutputTokens: 180,
              thinkingConfig: { thinkingLevel: "MINIMAL" }
            }
          }),
          signal: AbortSignal.timeout(3800)
        }
      );
      const data = await response.json().catch(() => null);
      const answer = data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim() || "";
      return {
        provider: "Gemini 3.5 Flash-Lite",
        ok: response.ok && Boolean(answer),
        status: response.status,
        latency_ms: Date.now() - startedAt,
        answer: answer.slice(0, 500),
        error: data?.error
          ? String(data.error.message || data.error.status || "").slice(0, 160)
          : undefined
      };
    } catch (error) {
      return {
        provider: "Gemini 3.5 Flash-Lite",
        ok: false,
        latency_ms: Date.now() - startedAt,
        error: error?.name || "Error",
        detail: String(error?.message || "").slice(0, 160)
      };
    }
  };

  const [cloudflare, gemini] = await Promise.all([
    cloudflareTest(),
    geminiTest()
  ]);

  return res.status(200).json({
    test: "same prompt with two previous dialogue turns; no Supabase reads or writes",
    cloudflare,
    gemini
  });
}
