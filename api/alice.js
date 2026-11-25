
export default function handler(req, res) {
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

  const body = req.body || {};

  const isNewSession = body.session?.new;

  const answer = isNewSession
    ? "Привет! Я твой новый голосовой помощник. Пока я только подключаюсь, но скоро мы сможем общаться с помощью искусственного интеллекта."
    : "Я тебя слышу! Связь с нашим помощником работает. Скоро подключим нейросеть.";

  return res.status(200).json({
    version: body.version || "1.0",
    response: {
      text: answer,
      end_session: false
    }
  });
}
