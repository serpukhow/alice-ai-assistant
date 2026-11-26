# Подключение GitHub Actions к Beget по SSH

Workflow: .github/workflows/beget-ssh.yml (на ветке main).

Он запускается только вручную и поддерживает пять фиксированных операций:
- check-ssh — проверить вход в аккаунт Beget.
- check-docker — проверить переход во внутреннее Docker-окружение Beget и доступность Node.js/npm.
- install-node — установить Node.js 24.15.0 в ~/.local для Ubuntu 22.04 x86_64; перед установкой проверяется SHA-256 официального архива.
- upload — отправить файлы приложения в каталог приложения вне public_html.
- restart — создать сигнал перезапуска Passenger (после настройки PassengerAppRoot).

Workflow не передаёт и не загружает файл .env, не меняет public_html и не запускает произвольную команду из пользовательского ввода.

## 1. Включить SSH на Beget

В панели Beget открой раздел «FTP и SSH» → вкладка SSH. Включи SSH-доступ. Там же найди:
- SSH-хост (например, username.beget.tech — используй точное значение из панели);
- логин аккаунта;
- порт (обычно 22).

SSH-подключение использует основной логин Beget. См. официальную инструкцию Beget:
https://beget.com/ru/kb/how-to/ssh/avtomaticheskaya-ssh-avtorizacziya-po-klyuchu

## 2. Создать отдельный ключ для GitHub Actions на Windows

Открой PowerShell и выполни:

    ssh-keygen -t ed25519 -C "github-actions-beget" -f "$env:USERPROFILE\.ssh\alice-beget-actions"

Когда программа попросит passphrase, нажми Enter два раза, оставив его пустым. Это отдельный ключ только для автоматизации GitHub Actions. Не используй основной личный ключ.

Публичная часть:

    Get-Content "$env:USERPROFILE\.ssh\alice-beget-actions.pub"

Скопируй одну строку, начинающуюся с ssh-ed25519. Это открытый ключ — его можно добавлять в Beget.

Приватную часть:

    Get-Content "$env:USERPROFILE\.ssh\alice-beget-actions"

Её нельзя публиковать или отправлять в чат. Она будет добавлена только в GitHub Actions Secret.

## 3. Добавить публичный ключ в Beget

Сначала подключись к аккаунту Beget через SSH или терминал панели. На внешнем уровне аккаунта выполни:

    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    touch ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys

Добавь публичную строку ключа в конец файла ~/.ssh/authorized_keys. Не заменяй файл целиком, если в нём уже есть другие ключи.

Для Node.js на виртуальном хостинге Beget требуется отдельный вход во внутреннее Docker-окружение командой:

    ssh localhost -p 222

Войди туда обычным способом. Внутри Docker повтори создание ~/.ssh/authorized_keys и добавь туда ту же публичную строку (если домашний каталог и файл общие с внешним окружением, повторная запись не нужна). Это позволит workflow проверить второй SSH-переход через проброшенный SSH-agent без хранения пароля Beget.

## 4. Добавить GitHub Actions Variables и Secrets

Открой репозиторий:
https://github.com/serpukhow/alice-ai-assistant/settings/secrets/actions

Перейди в Settings → Secrets and variables → Actions.

Создай Repository Variables:

- BEGET_SSH_HOST — точный SSH-хост из панели Beget.
- BEGET_SSH_USER — основной логин Beget.
- BEGET_SSH_PORT — порт из панели, обычно 22.
- BEGET_APP_DIR — alice-ai-assistant (относительный каталог в домашней директории, вне public_html).

Создай Repository Secrets:

- BEGET_SSH_PRIVATE_KEY — полное содержимое приватного файла alice-beget-actions, включая строки BEGIN и END.
- BEGET_KNOWN_HOSTS — запись сервера из known_hosts, чтобы SSH проверял ключ хоста и не принимал подмену.

### Получение записи known_hosts

Сначала установи обычное SSH-подключение к Beget с компьютера и проверь отпечаток ключа сервера с надёжным подтверждением Beget. Не соглашайся с неожиданной сменой host key без проверки.

Затем в PowerShell извлеки сохранённую доверенную запись (замени хост на значение из панели):

    $hostName = "username.beget.tech"
    ssh-keygen -F $hostName -f "$env:USERPROFILE\.ssh\known_hosts" | ForEach-Object { if ($_.Line -notmatch '^#') { $_.Line } } | Set-Content -Encoding ascii "$env:TEMP\beget-known-hosts.txt"

Открой файл:

    Get-Content "$env:TEMP\beget-known-hosts.txt"

Скопируй его содержимое в Secret BEGET_KNOWN_HOSTS. Если в панели указан нестандартный порт, запись должна соответствовать формату [host]:port.

Не добавляй приватный ключ в Variables, репозиторий или обычные файлы проекта.

## 5. Запустить проверку

Открой вкладку Actions:
https://github.com/serpukhow/alice-ai-assistant/actions

Выбери workflow «Beget SSH deployment» → Run workflow:
1. Сначала выбери check-ssh.
2. После успешного входа выбери check-docker.
3. Если Node.js отсутствует, выбери install-node. Операция подходит для Ubuntu 22.04 x86_64 и устанавливает Node.js 24.15.0 в ~/.local.
4. После успешной установки выбери check-docker ещё раз.
5. Только когда вход в Docker и Node.js/npm проверены, выбери upload.

Upload отправит:
- server.js
- package.json
- api/alice.js
- .env.example
- .gitignore

Файл .env не передаётся и не перезаписывается. Никаких настроек сайта и webhook Яндекса этот шаг не меняет.

## 6. Важное ограничение

Beget виртуальный хостинг запускает Node.js внутри Docker и через Apache Passenger. Поэтому после загрузки файлов всё ещё нужно отдельно настроить .env, путь Node.js, PassengerAppRoot и .htaccess. Эти действия делаются только после проверки версии Node.js и фактической структуры аккаунта.

До полной проверки /health, /api/alice и POST-запроса Яндекса не меняй webhook и не удаляй Vercel.
