# Demo media credits / Источники демо

The archive is intentionally redistributable. The MIT license for the application does not replace the following media/font licenses.

| Material                              | Author and source                                                                                                                       | License and changes                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Landscape photograph                  | Emanuele Rossini, [Freedom Icelandic Landscape](<https://commons.wikimedia.org/wiki/File:Freedom_Icelandic_Landscape_(135237371).jpeg>) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Original JPEG bytes retained. The cover's crop is an editable scene setting.                                                |
| Geyser footage                        | Vicartb, [Geisir.webm](https://commons.wikimedia.org/wiki/File:Geisir.webm), recorded in Iceland on 19 August 2016                      | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Converted to H.264/AAC MP4, 1280×720 / 25 fps, metadata removed. A still frame and mono WAV are derived from the same clip. |
| Noto Serif                            | [Noto project](https://github.com/notofonts/latin-greek-cyrillic), bundled font                                                         | [SIL Open Font License 1.1](../public/fonts/NotoSerif-OFL.txt). Unmodified font included in the archive. The complete copyright/license text is also stored in Iceland’s Sources section.  |
| Notes, layout and fictional itinerary | Atlas Canvas demonstration materials                                                                                                    | [MIT](../LICENSE). No actual trip, booking or travel advice is implied.                                                                                                                    |

## Rebuild / Пересборка

The checked-in `.atlas` is ready to use; rebuilding is optional. It does not need a connection after download/import. No personal database is used.

Download the two linked originals into a separate working folder. Name the photograph `highlands-original.jpg` and the video `geisir-original.webm`. Use FFmpeg to prepare the clip, still and audio:

```sh
ffmpeg -i geisir-original.webm -vf scale=1280:720 -r 25 -c:v libx264 -crf 24 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart -map_metadata -1 geisir.mp4
ffmpeg -ss 4 -i geisir.mp4 -frames:v 1 -q:v 2 geisir-poster.jpg
ffmpeg -i geisir.mp4 -vn -ac 1 -ar 22050 geisir-ambient.wav
```

From the repository root:

```sh
python3 scripts/build-demo.py /absolute/path/to/prepared-media
npm run demo:check
```

The Python builder uses only the standard library. It writes the public archive and its readable `demo/scenes.json` source. `demo:check` checks ZIP CRC, SHA-256, scene validation, media references and the absence of global preference changes. Byte-identical video output across FFmpeg versions is not assumed.
