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
          max_tokens: 40,
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
      console.error("Cloudflare smoke test returned unsupported response format");
      return res.status(502).json({
        ok: false,
        error: "Empty or unsupported response format",
        result_keys: Object.keys(result)
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
