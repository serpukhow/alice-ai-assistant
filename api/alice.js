
function limitUtf8(value, maxBytes) {
  const buffer = Buffer.from(value, "utf8");

  if (buffer.length <= maxBytes) {
    return value;
  }

  return buffer
    .subarray(0, maxBytes)
    .toString("utf8")
    .replace(/\uFFFD$/, "");
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  let history = value
    .filter(item =>
      Array.isArray(item) &&
      item.length === 2 &&
      (item[0] === "u" || item[0] === "m") &&
      typeof item[1] === "string"
    )
    .map(([role, text]) => [
      role,
      limitUtf8(text, role === "u" ? 160 : 260)
    ])
    .slice(-4);

  if (history.length % 2 !== 0) {
    history = history.slice(1);
  }

  return history;
}

function makeSessionState(history) {
  let items = history.slice(-4);

  while (items.length > 0) {
    const state = { h: items };

    if (
      Buffer.byteLength(
        JSON.stringify(state),
        "utf8"
      ) <= 950
    ) {
      return state;
    }

    items = items.slice(2);
  }

  return { h: [] };
}

export default async function handler(req, res) {
  const MODEL = "gemini-3.5-flash-lite";

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Alice AI Assistant is running",
      model: MODEL,
      memory: "session"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  let body = {};
  let history = [];

  try {
    body = req.body || {};

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    if (!body || typeof body !== "object") {
      body = {};
    }

    const isNewSession = body.session?.new === true;

    history = isNewSession
      ? []
      : normalizeHistory(body.state?.session?.h);

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        version: body.version || "1.0",
        response: {
          text: "Не найден ключ Gemini. Проверь настройки сервера.",
          end_session: false
        },
        session_state: makeSessionState(history)
      });
    }

    const rawCommand =
      body.request?.command ||
      body.request?.original_utterance ||
      "";

    const command =
      typeof rawCommand === "string"
        ? rawCommand.trim()
        : "";

    if (!command) {
      return res.status(200).json({
        version: body.version || "1.0",
        response: {
          text: "Привет! Я на связи. Что хочешь узнать?",
          end_session: false
        },
        session_state: makeSessionState(history)
      });
    }

    const contents = history.map(([role, text]) => ({
      role: role === "m" ? "model" : "user",
      parts: [{ text }]
    }));

    contents.push({
      role: "user",
      parts: [{ text: command }]
    });

    const start = Date.now();

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents,
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
      "Gemini response time:",
      Date.now() - start,
      "ms"
    );

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", data);
      throw new Error(
        "Gemini API error: " + geminiResponse.status
      );
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim() || "";

    if (!answer) {
      console.error("Gemini empty response:", data);
      throw new Error("Gemini returned an empty response");
    }

    const spokenAnswer = answer.slice(0, 1024);

    const updatedHistory = [
      ...history,
      ["u", limitUtf8(command, 160)],
      ["m", limitUtf8(spokenAnswer, 260)]
    ];

    const sessionState =
      makeSessionState(updatedHistory);

    return res.status(200).json({
      version: body.version || "1.0",
      response: {
        text: spokenAnswer,
        end_session: false
      },
      session_state: sessionState
    });

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(200).json({
      version: body.version || "1.0",
      response: {
        text: "Сейчас не получается получить ответ от нейросети. Попробуй немного позже.",
        end_session: false
      },
      session_state: makeSessionState(history)
    });
  }
}
