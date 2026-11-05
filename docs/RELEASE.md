[English](en/RELEASE.md) · [README](../README.md) · [Руководство](USER_GUIDE.md)

# Сборка и выпуск

Эта страница для автора проекта. Для установки готового приложения — [инструкция пользователя](INSTALLATION.md).

## Что появится в одном релизе

| Компьютер                                   | Файлы                                            |
| ------------------------------------------- | ------------------------------------------------ |
| Mac с Intel                                 | `Atlas-Canvas_0.4.2_macOS-Intel.dmg`             |
| Mac с Apple Silicon: M1, M2, M3, M4 и новее | `Atlas-Canvas_0.4.2_macOS-Apple-Silicon.dmg`     |
| Windows x64                                 | `Atlas-Canvas_0.4.2_Windows-x64-setup.exe`       |
| Linux x64                                   | `Atlas-Canvas_0.4.2_Linux-x64.deb` и `.AppImage` |

В Assets публикуются пять установщиков и `SHA256SUMS.txt`. Демо и инструкции доступны по ссылкам в описании. GitHub также добавляет два архива исходников. Номер версии в именах меняется автоматически.

**Platform builds** собирает и тестирует все четыре цели на PR и после push в `main`. **Desktop release** запускается на тег `v*` и использует ту же матрицу. Только после успешных сборок отдельный шаг собирает все файлы в один **draft prerelease**. Публикация остаётся ручной; опубликованный релиз скрипт не перезаписывает.

Mac-приложения подписаны локально через `tauri.macos.conf.json`, без Developer ID и нотарификации; Windows installer также без подписи издателя. Windows включает WebView2 для офлайн-установки. Linux собирается на Ubuntu 22.04; другие дистрибутивы нужно проверять отдельно.

## Перед обновлением

Экспортируйте `.atlas` со своими записями. Основной identifier `com.m1.tauri-app` сохранён; тестовые приложения с другими identifier используют отдельные данные. При переходе из отдельной тестовой сборки перенесите записи через `.atlas`.

Сцены 0.4 используют формат 5, который не открывается в 0.2/0.3. Для отката нужна копия до обновления. Один SQLite без папки `assets/` не является полной резервной копией.

## Подготовить выпуск

Перед созданием тега обновите номер версии в `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` и `src-tauri/Cargo.lock`. Все значения должны совпадать. Для каждого выпуска используйте новый номер.

Из корня репозитория выполните:

```sh
npm ci
npm test
npm run demo:check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run format:check
npm run notices
node scripts/check-version.mjs
git diff --check
```

Отправьте изменения через pull request в `main`. Дождитесь зелёного **Platform builds**. В **Actions → запуск → Artifacts** скачайте четыре набора пакетов. Проверьте установку, медиа, сохранение после перезапуска и импорт демо на соответствующих системах, затем слейте PR.

## Создать тег

После слияния обновите `main` и создайте тег с номером, указанным в файлах. Например, для версии 0.4.2:

```sh
git switch main
git pull --ff-only origin main
git tag v0.4.2
git push origin v0.4.2
```

Откройте **Actions → Desktop release**. Сначала проверяется существующий тег и совпадение версии npm/Cargo/Tauri, затем идут четыре сборки и подготовка черновика. Фиксированного времени ожидания нет.

Для повтора используйте **Run workflow**, выберите ветку с workflow и укажите **существующий тег**, например `v0.4.2`. Сборка возьмёт commit этого тега; произвольная ветка не превратится в релиз автоматически.

После успешного завершения:

1. Откройте [Releases](https://github.com/avdasich/atlas-canvas/releases) и отредактируйте черновик нужной версии.
2. Проверьте оба Mac-варианта, Windows, Linux и контрольные суммы в Assets.
3. Скачайте пакеты и проверьте их на соответствующих ОС.
4. Нажмите **Publish release**. Для предварительного выпуска оставьте **Pre-release**.
5. Проверьте публичную ссылку без входа в аккаунт.

Черновик до публикации виден владельцу и уполномоченным участникам, поэтому обычный пользователь может получать 404. Если один из билдов упал, сначала исправьте причину и перезапустите workflow; тег сам по себе ошибку не исправляет.

Уже опубликованные теги и файлы не заменяйте: обновите все версии через новый номер и создайте новый тег. Скрипт проверяет `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` и `tauri.conf.json`.

## Как устроена автоматизация

- `build-desktop.yml` — общая матрица сборок, проверка демо и тесты. Артефакты хранятся 14 дней.
- `platform-checks.yml` — вызов общей матрицы для PR/main и ручного запуска.
- `desktop-release.yml` — проверка тега, общие сборки и один шаг прикрепления файлов к черновику.
- `package-desktop.mjs` — понятные имена файлов; проверяет подпись `.app` через `codesign --verify --deep --strict` и архитектуру через `lipo`.
- `prepare-release.mjs` — требует все пять установщиков и добавляет SHA-256.
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
