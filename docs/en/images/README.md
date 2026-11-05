[Русский](../../images/README.md) · [Main page](../../../README.en.md) · [User guide](../USER_GUIDE.md)

# Add your screenshots

The guides contain numbered SVG placeholders. Both languages use the same files under `docs/images/`; one set of screenshots is enough. A ready-made [demo atlas and shooting checklist](../../../demo/README.en.md) provide content for every scene.

## Replace a placeholder

1. Capture a clear example without personal information.
2. Save a PNG/JPG under `docs/images/`, using the same base name, such as `05-text.png`.
3. Change the image extension in both `docs/USER_GUIDE.md` and `docs/en/USER_GUIDE.md`. Installation images also appear in both installation pages.

For example, the English guide uses:

```md
![Editing a note](../images/05-text.png)
```

The Russian guide uses `images/05-text.png` because it is one directory higher. Both main README files use the same hero screenshot under `docs/screenshots/`; update both links if you replace it. Remove the old SVG once no page references it.

| Number / base name | Capture                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `01-overview`      | A finished canvas with photos, notes and a table; suitable for the README cover. |
| `02-installation`  | Published GitHub release, expanded Assets and correct platform downloads.        |
| `03-map`           | Map with country search and countries containing records.                        |
| `04-editor`        | Editor overview: tools, properties, save status.                                 |
| `05-text`          | Text editor with a selected styled passage.                                      |
| `06-images`        | Selected photo, resize handles and properties.                                   |
| `07-tables`        | Populated table and saved/preset styles.                                         |
| `08-media`         | Video, audio and a link card.                                                    |
| `09-background`    | Snow shimmer with its effect controls.                                           |
| `10-navigation`    | Search result and saved-view navigation.                                         |
| `11-backup`        | Archive and restore panel.                                                       |
| `12-export`        | PNG/PDF choices or a saved export.                                               |
| `13-crop`          | Crop frame, aspect ratio and Apply control.                                      |
| `14-disclosures`   | Expanded content, folded heading and section properties.                         |
| `15-materials`     | Glass panels/lettering and sparkling shape over a varied background.             |

For moving effects, a short video shows shimmer more clearly than a static screenshot. Keep the README preview compact and link longer walkthroughs separately.
