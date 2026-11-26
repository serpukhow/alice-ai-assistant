# Развёртывание Alice AI Assistant на Beget

## Что переносится

- api/alice.js — текущая логика навыка, память и работа с AI-провайдерами.
- server.js — HTTP-обёртка для запуска обработчика как обычного Node.js-приложения.
- package.json — минимальная конфигурация Node.js, внешние npm-пакеты не нужны.

Секретные ключи в репозитории не хранятся. Они задаются отдельно в файле .env в каталоге приложения, который должен располагаться вне public_html.

## 1. Сначала проверить Beget

В панели Beget открой терминал, подключись к SSH и войди в Docker-окружение:

    ssh localhost -p 222

Затем выполни:

    cat /etc/os-release
    node -v
    npm -v
    pwd
    which node

Для этого приложения нужна Node.js 20 или новее: используются встроенные fetch и AbortSignal.any.

Если Node.js отсутствует или старше 20, установи совместимую версию по актуальной инструкции Beget. Не устанавливай Node.js вслепую: сначала проверь версию Ubuntu.

## 2. Разместить приложение

Создай каталог приложения вне public_html, например:

    mkdir -p ~/alice-ai-assistant

Загрузи туда файлы проекта из GitHub-архива ветки feature/conversation-context, сохранив структуру каталогов. В каталоге приложения должны находиться:

    server.js
    package.json
    api/alice.js
    .env.example

Файл api/alice.js должен быть взят из той же ветки и коммита, что и server.js.

## 3. Настроить ключи

В каталоге приложения создай файл .env (не .env.example) и заполни его действующими значениями:

    GEMINI_API_KEY=...
    CLOUDFLARE_ACCOUNT_ID=...
    CLOUDFLARE_AI_TOKEN=...
    SUPABASE_URL=...
    SUPABASE_SECRET_KEY=...

Не отправляй эти значения в чат и не добавляй .env в GitHub. Права на файл желательно ограничить:

    chmod 600 .env

## 4. Настроить Passenger

В .htaccess сайта укажи реальные абсолютные пути. Пример — замени USERNAME на логин Beget и проверь путь which node:

    PassengerNodejs /home/u/USERNAME/.local/bin/node
    PassengerAppRoot /home/u/USERNAME/alice-ai-assistant
    PassengerAppType node
    PassengerStartupFile server.js

Точный путь к Node.js и домашнему каталогу нужно брать из вывода команд на аккаунте. Не копируй пример путей без проверки.

Создай каталог перезапуска Passenger:

    mkdir -p ~/alice-ai-assistant/tmp
    touch ~/alice-ai-assistant/tmp/restart.txt

Если Beget требует открыть доступ Node.js из веб-окружения к ~/.local, выполни соответствующую инструкцию из базы знаний Beget.

## 5. Проверить запуск

После установки проверь:

    cd ~/alice-ai-assistant
    node --check server.js
    node --check api/alice.js
    node -e "console.log(process.version)"

Затем открой в браузере:

    https://ТВОЙ-ДОМЕН/health

Ожидаемый ответ:

    {"status":"ok","service":"alice-ai-assistant","runtime":"v20..."}

Проверка обработчика:

    https://ТВОЙ-ДОМЕН/api/alice

Ожидается JSON со статусом Alice AI Assistant is running.

## 6. Переключение навыка Яндекса

Только после успешной проверки /health, /api/alice и POST-запроса Яндекса замени Webhook URL в черновике навыка на:

    https://ТВОЙ-ДОМЕН/api/alice

Старый Vercel Preview и Production пока не удалять. Сначала убедиться, что новая площадка стабильно отвечает и сохраняет контекст в Supabase.

## Важно

- Не размещай .env внутри public_html.
- Не публикуй ключи в GitHub, сообщениях и скриншотах.
- Внешние API Gemini, Cloudflare и Supabase продолжают работать как раньше; при переносе меняется только хостинг backend.
- vercel.json на Beget не нужен.
