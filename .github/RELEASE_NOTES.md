## Скачать / Download

| Система / Platform                              | Файл / File                                     |
| ----------------------------------------------- | ----------------------------------------------- |
| macOS Intel                                     | `…macOS-Intel.dmg` (или / or `.zip`)            |
| macOS Apple Silicon — M1 и новее / M1 and later | `…macOS-Apple-Silicon.dmg` (или / or `.zip`)    |
| Windows x64                                     | `…Windows-x64-setup.exe`                        |
| Linux x64                                       | `…Linux-x64.deb` или / or `…Linux-x64.AppImage` |

Mac: откройте DMG и перенесите приложение в Программы. / Open the DMG and drag the app to Applications.

Linux AppImage: разрешите выполнение файла, затем откройте его. / Make the file executable, then run it.

## В этом выпуске / In this release

- Готовый демонстрационный `.atlas`: три холста, фотографии, видео гейзера и звук. / Ready-made demo atlas with three canvases, photos, geyser footage and audio.
- Английский README и документация со ссылками переключения языка. / English README and documentation with language links.
- Отдельные пакеты Intel/Apple Silicon, Windows и Linux в одном выпуске. / Separate Intel/Apple Silicon, Windows and Linux packages in one release.
- Обрезка, сноски, стекло и блестяшки из 0.4 сохранены. / Includes the crop, expandable-note, glass and sparkle tools from 0.4.

## Демо / Demo

Скачайте `Atlas-Canvas-Iceland.atlas` и откройте его через «Архив и восстановление». Инструкции — `DEMO-README.ru.md` и `DEMO-README.en.md`. / Download the `.atlas` and import it through Archive and restore; see the attached instructions.

[Media credits / Источники](https://github.com/avdasich/atlas-canvas/blob/main/demo/SOURCES.md).

## Обновление / Updating

Перед обновлением экспортируйте полный `.atlas` со своими записями. Формат 5 не открывается в 0.2/0.3. / Export your own `.atlas` backup before updating. Scene format 5 cannot be opened by 0.2/0.3.

Это предварительные неподписанные сборки: macOS пока без Developer ID/notarization, Windows без подписи издателя. Установщик Windows включает WebView2 для офлайн-установки. Linux собран на Ubuntu 22.04; проверьте совместимость своего дистрибутива. / Preview unsigned builds; no macOS Developer ID/notarization or Windows publisher signature yet. Windows includes WebView2 for offline installation. Linux uses Ubuntu 22.04 as its build baseline.

`SHA256SUMS.txt` содержит контрольные суммы файлов. / SHA-256 checksums are attached.
