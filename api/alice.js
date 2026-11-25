
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Alice AI Assistant is running",
      model: "grok-4.7"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      version: "1.0",
      response: {
        text: "Не найден ключ Grok. Проверь настройки сервера.",
        end_session: false
      }
    });
  }

  try {
    let body = req.body || {};

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const command =
      body.request?.command ||
      body.request?.original_utterance ||
      "";

    if (!command.trim()) {
      return res.status(200).json({
        version: body.version || "1.0",
        response: {
          text: "Привет! Я на связи. Что хочешь узнать?",
          end_session: false
        }
      });
    }

    const start = Date.now();

    const grokResponse = await fetch(
      "https://api.x.ai/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "grok-4.7",
          input: command,
          temperature: 0.7,
          max_output_tokens: 300
        }),
        signal: AbortSignal.timeout(8000)
      }
    );

    const data = await grokResponse.json();

    console.log(
      "Grok response time:",
      Date.now() - start,
      "ms"
    );

    if (!grokResponse.ok) {
      console.error("Grok API error:", data);
      throw new Error("Grok API error: " + grokResponse.status);
    }

    const answer =
      data.output
        ?.filter(item => item.type === "message")
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text || "")
        .join("")
        .trim() ||
      data.output_text ||
      "";

    if (!answer) {
      throw new Error("Grok returned an empty response");
    }

    return res.status(200).json({
      version: body.version || "1.0",
      response: {
        text: answer.slice(0, 1024),
        end_session: false
      }
    });

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(200).json({
      version: "1.0",
      response: {
        text: "Сейчас не получается получить ответ от нейросети. Попробуй немного позже.",
        end_session: false
      }
    });
  }
}

