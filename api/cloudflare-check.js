export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_TOKEN;

  if (!accountId || !apiToken) {
    return res.status(503).json({ ok: false, error: "Cloudflare configuration missing" });
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/zai-org/glm-4.7-flash`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "Отвечай кратко и на русском языке." },
            { role: "user", content: "Напиши строго: Cloudflare работает." }
          ],
          max_tokens: 100,
          chat_template_kwargs: {
            enable_thinking: false
          },
          stream: false
        }),
        signal: AbortSignal.timeout(7000)
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.success === false) {
      const codes = Array.isArray(data?.errors)
        ? data.errors.map(item => item?.code || "provider_error").join(", ")
        : "";
      console.error("Cloudflare smoke test failed:", response.status, codes);
      return res.status(502).json({
        ok: false,
        provider_status: response.status,
        error_codes: codes
      });
    }

    const result = data?.result || {};
    const choices = result.choices || data?.choices;
    const candidates = [
      result.response,
      result.output_text,
      choices?.[0]?.message?.content,
      choices?.[0]?.text,
      result.response?.choices?.[0]?.message?.content
    ];
    const answer = candidates.find(value =>
      typeof value === "string" && value.trim()
    )?.trim() || "";

    if (!answer) {
      const firstChoice = Array.isArray(result.choices) ? result.choices[0] : null;
      const message = firstChoice?.message;
      return res.status(200).json({
        ok: false,
        error: "Response shape inspected",
        result_keys: Object.keys(result),
        choice_keys: firstChoice && typeof firstChoice === "object" ? Object.keys(firstChoice) : [],
        message_type: typeof message,
        message_keys: message && typeof message === "object" ? Object.keys(message) : [],
        content_type: typeof message?.content,
        content_is_array: Array.isArray(message?.content),
        content_is_null: message?.content === null,
        reasoning_content_type: typeof message?.reasoning_content,
        reasoning_content_sample: typeof message?.reasoning_content === "string"
          ? message.reasoning_content.slice(0, 300)
          : null,
        reasoning_type: typeof message?.reasoning,
        reasoning_sample: typeof message?.reasoning === "string"
          ? message.reasoning.slice(0, 300)
          : null,
        finish_reason: firstChoice?.finish_reason,
        token_usage: data?.result?.usage || null
      });
    }

    return res.status(200).json({
      ok: true,
      model: "@cf/zai-org/glm-4.7-flash",
      latency_ms: Date.now() - startedAt,
      answer: answer.slice(0, 200)
    });
  } catch (error) {
    console.error("Cloudflare smoke test request failed:", error?.name || "Error");
    return res.status(502).json({
      ok: false,
      error: error?.name || "Request failed"
    });
  }
}
