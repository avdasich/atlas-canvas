[English](en/RELEASE.md) · [README](../README.md) · [Руководство](USER_GUIDE.md)

# Сборка и выпуск

Эта страница для автора проекта. Для установки готового приложения — [инструкция пользователя](INSTALLATION.md).

## Что появится в одном релизе

| Компьютер                                   | Файлы                                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| Mac с Intel                                 | `Atlas-Canvas_0.4.1_macOS-Intel.dmg` и `.zip`         |
| Mac с Apple Silicon: M1, M2, M3, M4 и новее | `Atlas-Canvas_0.4.1_macOS-Apple-Silicon.dmg` и `.zip` |
| Windows x64                                 | `Atlas-Canvas_0.4.1_Windows-x64-setup.exe`            |
| Linux x64                                   | `Atlas-Canvas_0.4.1_Linux-x64.deb` и `.AppImage`      |

Дополнительно: `Atlas-Canvas-Iceland.atlas`, инструкции демо на двух языках и `SHA256SUMS.txt`. Номер версии в именах меняется автоматически.

**Platform builds** собирает и тестирует все четыре цели на PR и после push в `main`. **Desktop release** запускается на тег `v*` и использует ту же матрицу. Только после успешных сборок отдельный шаг собирает все файлы в один **draft prerelease**. Публикация остаётся ручной; опубликованный релиз скрипт не перезаписывает.

Mac-пакеты пока не подписаны Developer ID и не нотарифицированы; Windows installer также без подписи издателя. Windows включает WebView2 для офлайн-установки. Linux собирается на Ubuntu 22.04; другие дистрибутивы нужно проверять отдельно.

## Перед обновлением

Экспортируйте `.atlas` со своими записями. Основной identifier `com.m1.tauri-app` сохранён; тестовые приложения с другими identifier используют отдельные данные. Если записи находятся в **Atlas Canvas QA 03**, экспортируйте их именно оттуда и перенесите архивом.

Сцены 0.4 используют формат 5, который не открывается в 0.2/0.3. Для отката нужна копия до обновления. Один SQLite без папки `assets/` не является полной резервной копией.

## Отправить изменения на проверку

Текущие изменения подготовлены в ветке `chore/demo-english-desktop-releases`. Выполните:

```sh
cd /Users/m1/atlas-canvas
npm ci
npm test
npm run demo:check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run format:check
npm run notices
node scripts/check-version.mjs
git diff --check

git add .
git diff --cached --stat
git commit -m "Add demo atlas, English docs and desktop releases"
git push -u origin chore/demo-english-desktop-releases
```

Создайте PR в `main`. Дождитесь зелёного **Platform builds**. В **Actions → запуск → Artifacts** будут четыре набора пакетов: Intel Mac, Apple Silicon Mac, Windows и Linux. Скачайте их и проверьте запуск, медиа, сохранение/перезапуск и импорт демо на целевых системах. Затем слейте PR.

## Создать выпуск 0.4.1

Тег `v0.4.0` уже существует; используйте новый согласованный номер:

```sh
git switch main
git pull --ff-only origin main
git tag v0.4.1
git push origin v0.4.1
```

Откройте **Actions → Desktop release**. Сначала проверяется существующий тег и совпадение версии npm/Cargo/Tauri, затем идут четыре сборки и подготовка черновика. Фиксированного времени ожидания нет.

Для повтора используйте **Run workflow**, выберите ветку с новым workflow и укажите **существующий тег**, например `v0.4.1`. Сборка возьмёт commit этого тега; произвольная ветка не превратится в релиз автоматически.

После успешного завершения:

1. Откройте [Releases](https://github.com/avdasich/atlas-canvas/releases) и отредактируйте черновик нужной версии.
2. Проверьте оба Mac-варианта, Windows, Linux, демо и контрольные суммы в Assets.
3. Скачайте пакеты и проверьте их на соответствующих ОС.
4. Нажмите **Publish release**. Для предварительного выпуска оставьте **Pre-release**.
5. Проверьте публичную ссылку без входа в аккаунт.

Черновик до публикации виден владельцу и уполномоченным участникам, поэтому обычный пользователь может получать 404. Если один из билдов упал, сначала исправьте причину и перезапустите workflow; тег сам по себе ошибку не исправляет.

Уже опубликованные теги и файлы не заменяйте: обновите все версии через новый номер и создайте новый тег. Скрипт проверяет `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` и `tauri.conf.json`.

## Как устроена автоматизация

- `build-desktop.yml` — общая матрица сборок, проверка демо и тесты. Артефакты хранятся 14 дней.
- `platform-checks.yml` — вызов общей матрицы для PR/main и ручного запуска.
- `desktop-release.yml` — проверка тега, общие сборки и один шаг прикрепления файлов к черновику.
- `package-desktop.mjs` — понятные имена файлов; macOS ZIP создаётся через `ditto` с сохранением прав `.app`.
- `prepare-release.mjs` — требует все семь пакетов, добавляет демо/инструкции и SHA-256.
- `upload-release.mjs` — создаёт или обновляет черновик через стандартный `GITHUB_TOKEN`, без публикации. Платные сервисы и дополнительные secrets не нужны для неподписанных сборок.

Матрица: `macos-15-intel` / `x86_64-apple-darwin`, `macos-15` / `aarch64-apple-darwin`, `windows-latest` / `x86_64-pc-windows-msvc`, `ubuntu-22.04` / `x86_64-unknown-linux-gnu`.

## Локальная сборка

Установите [зависимости Tauri](https://v2.tauri.app/start/prerequisites/) для своей ОС, Node.js 24 и Rust stable.

```sh
npm ci
npm run notices
npm run tauri build
```

Результат — `src-tauri/target/release/bundle/`. При явном `--target` файлы находятся в `src-tauri/target/<target>/release/bundle/`. Сборка на Mac не создаёт готовый Windows installer.

Для отдельной проверки на macOS:

```sh
npm run tauri build -- --debug --bundles app --config '{"identifier":"com.m1.atlas-canvas.my-check","productName":"Atlas Canvas My Check"}'
```

У такой программы собственная пустая база. Импортируйте [демо](../demo/README.md). Не меняйте основной identifier ради тестирования и не открывайте два экземпляра одной базы одновременно.
