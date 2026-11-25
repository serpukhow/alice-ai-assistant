
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Alice AI Assistant is running"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      version: "1.0",
      response: {
        text: "Не найден ключ Gemini. Проверь настройки сервера.",
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

    const geminiStart = Date.now();

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: command
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300
          }
        }),
        signal: AbortSignal.timeout(4000)
      }
    );

    const data = await geminiResponse.json();

    console.log(
      "Gemini total response time:",
      Date.now() - geminiStart,
      "ms"
    );

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", data);
      throw new Error("Gemini API error: " + geminiResponse.status);
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      throw new Error("Gemini returned an empty response");
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

