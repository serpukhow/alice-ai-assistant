export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      stage: "configuration",
      message: "GEMINI_API_KEY is not configured in this deployment environment"
    });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Ответь одним словом: OK" }] }],
          generationConfig: { maxOutputTokens: 20 }
        }),
        signal: AbortSignal.timeout(12000)
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        stage: "google_api",
        httpStatus: response.status,
        googleStatus: data?.error?.status || "UNKNOWN",
        message: String(data?.error?.message || "No error message").slice(0, 500)
      });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim() || "";

    return res.status(200).json({
      ok: Boolean(answer),
      stage: "complete",
      model: "gemini-3.5-flash-lite",
      answer: answer || "Empty model response"
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      stage: "network",
      errorName: error?.name || "Error",
      message: String(error?.message || "").slice(0, 300)
    });
  }
}
