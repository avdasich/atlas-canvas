## Скачать / Download

| Компьютер / Computer             | Файл / File                                     |
| -------------------------------- | ----------------------------------------------- |
| Mac с M1 и новее / Apple Silicon | `…macOS-Apple-Silicon.dmg`                      |
| Mac с Intel / Intel Mac          | `…macOS-Intel.dmg`                              |
| Windows x64                      | `…Windows-x64-setup.exe`                        |
| Linux x64                        | `…Linux-x64.AppImage` или / or `…Linux-x64.deb` |

**Mac:** откройте DMG, перенесите Atlas Canvas в Программы. / Open the DMG and drag Atlas Canvas to Applications.

**Linux AppImage:** разрешите выполнение файла и запустите его. / Make the file executable and run it.

[Установка](https://github.com/avdasich/atlas-canvas/blob/main/docs/INSTALLATION.md) · [Installation](https://github.com/avdasich/atlas-canvas/blob/main/docs/en/INSTALLATION.md)

## Изменения / Changes

- Автокопии создаются в фоне после изменений холста, не чаще раза в час. Сохранение записей не ждёт архивации. / Automatic backups run in the background after canvas changes, at most once per hour, without blocking canvas saves.
- Остаются последние 5 автокопий. Незавершённые временные файлы очищаются при следующей проверке; отказ удаления одного файла не мешает созданию нового архива. / Keep the latest 5 automatic copies. Interrupted temporary files are cleaned up on the next check; one failed removal does not block a new archive.
- Проверки выполняются не чаще раза в минуту; после ошибки архивации повтор откладывается на час. Одинаковые ошибки и предупреждения показываются один раз за сессию. / Checks run at most once per minute, archive failures delay retries for one hour, and identical errors or warnings appear once per session.
- Упрощены README и инструкции на русском и английском. / Simplified Russian and English README files and guides.

**При первой успешной автокопии после обновления старые автокопии сверх 5 будут удалены безвозвратно. Ручные экспорты и копии перед восстановлением сохраняются.** / **The first successful automatic backup after updating permanently deletes automatic copies beyond 5. Manual exports and pre-restore copies are kept.**

[Попробовать демо](https://github.com/avdasich/atlas-canvas/blob/main/demo/README.md) · [Try the demo](https://github.com/avdasich/atlas-canvas/blob/main/demo/README.en.md)

Перед обновлением сохраните копию атласа в `.atlas`. / Export an `.atlas` backup before updating.

Mac-сборки имеют локальную подпись, без Developer ID и нотарификации Apple; система может блокировать первый запуск. Windows пока без подписи издателя. / Mac builds are ad-hoc signed, without Apple Developer ID or notarization; macOS may block the first launch. Windows builds currently have no publisher signature.

`SHA256SUMS.txt` — контрольные суммы установщиков. / Installer checksums. **Source code** — исходники, не приложение. / Source files, not the app.
