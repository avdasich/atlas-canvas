"""Build the public demo from prepared CC0 media. No user databases are read.

Usage: python3 scripts/build-demo.py /path/to/prepared-media
Required files: highlands-original.jpg, geisir-poster.jpg, geisir.mp4,
                geisir-ambient.wav. See demo/SOURCES.md for originals/conversion.
"""
from pathlib import Path
import hashlib
import json
import sys
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = uuid.UUID("2ad30512-3df9-435d-a791-3c1cbfe790b8")


def uid(name):
    return str(uuid.uuid5(NS, name))


def item(kind, name, x, y, **props):
    return dict(id=uid(name), kind=kind, x=x, y=y, **props)


def note(name, text, x, y, width=580, size=24, **props):
    return item("note", name, x, y, content=text, width=width, fontSize=size, lineHeight=1.3, **props)


def table(name, x, y, rows, widths, **props):
    data = dict(cells=[[dict(text=str(c)) for c in row] for row in rows], columnWidths=widths,
                rowHeights=[48] * len(rows), header=True, borderColor="#d6d1c2",
                background="#f5f1e7", color="#253a40", borderWidth=1, fontSize=18,
                padding=12, radius=12, headerFill="#e2d6bc")
    data.update(props)
    return item("table", name, x, y, title="Маршрут · идея путешествия", table=data)


def section(name, title, text, collapsed=True, height=122):
    return dict(id=uid(name), title=title, content=text, collapsed=collapsed, height=height)


def scene(items, **theme):
    base = dict(background="#142630", pattern="none", fontFamily="Noto Sans", textColor="#edf4f5")
    base.update(theme)
    return dict(schemaVersion=5, items=items, theme=base, camera=dict(x=95, y=18, scale=0.62))


def build(media):
    assets, payload = [], {}

    def asset(name, filename, mime, source=None):
        source = source or media / filename
        data = source.read_bytes()
        identifier = uid("asset:" + name)
        path = f"assets/{identifier}{source.suffix}"
        checksum = hashlib.sha256(data).hexdigest()
        assets.append(dict(id=identifier, original_name=filename, internal_path=path,
                           preview_path=path, bytes=len(data), mime=mime, sha256=checksum,
                           preview_sha256=checksum))
        payload[path] = data
        return identifier

    mountain = asset("highlands", "highlands-original.jpg", "image/jpeg")
    poster = asset("geyser-photo", "geisir-poster.jpg", "image/jpeg")
    video = asset("geyser-video", "geisir.mp4", "video/mp4")
    audio = asset("geyser-audio", "geisir-ambient.wav", "audio/wav")
    font = asset("serif", "NotoSerif.ttf", "font/ttf", ROOT / "public/fonts/NotoSerif.ttf")
    serif = "AtlasFont-" + font
    glass = dict(enabled=True, blur=10, tint="#e2f2fa", opacity=0.27)
    sparkle = dict(enabled=True, intensity=0.65, speed=0.65, color="#ffffff")
    sources = ("Фото: Emanuele Rossini — Freedom Icelandic Landscape (CC0).\n"
               "https://commons.wikimedia.org/wiki/File:Freedom_Icelandic_Landscape_(135237371).jpeg\n\n"
               "Видео, кадр и звук: Vicartb — Geisir.webm (CC0), перекодировано в MP4/WAV.\n"
               "https://commons.wikimedia.org/wiki/File:Geisir.webm\n\n"
               "Шрифт: Noto Serif, SIL Open Font License 1.1.\n"
               "Тексты и маршрут — вымышленный пример для демонстрации приложения.")
    sources += "\n\n" + (ROOT / "public/fonts/NotoSerif-OFL.txt").read_text(encoding="utf8")
    iceland = [
        item("image", "is-hero", 0, 0, width=1240, height=340, assetId=mountain,
             title="Исландский пейзаж · Emanuele Rossini / CC0", crop=dict(x=0, y=0.1, width=1, height=0.485)),
        item("rectangle", "is-shade", 620, 170, width=1240, height=340,
             fill="#091921", strokeWidth=0, opacity=0.25, locked=True, cornerRadius=0),
        note("is-kicker", "ЛИЧНЫЙ АТЛАС  /  01", 38, 32, size=16, fill="#ffffff"),
        note("is-title", "Исландия", 32, 89, width=870, size=94, fontFamily=serif,
             glass=glass, shimmer=sparkle),
        note("is-subtitle", "Ветер, вода и места, которые хочется запомнить.", 40, 239, width=900, size=22, fill="#ffffff"),
        item("star", "is-star", 1145, 76, scaleX=0.65, scaleY=0.65, glass=glass, shimmer=sparkle),
        note("is-left-label", "01  /  НЕСПЕШНЫЙ МАРШРУТ", 0, 369, size=15, fill="#b6c9c9"),
        note("is-right-label", "02  /  МОМЕНТ В ДВИЖЕНИИ", 650, 369, size=15, fill="#b6c9c9"),
        table("is-route", 0, 410, [["День", "Место", "Оставить время на…"],
              ["01", "Рейкьявик", "Прогулку без спешки"], ["02", "Гейзеры", "Видео и шум воды"],
              ["03", "Пейзажи", "Остановки по пути"]], [90, 180, 320]),
        item("video", "is-video", 650, 410, width=590, height=356, assetId=video,
             title="Гейзер, Исландия · 15 секунд · Vicartb / CC0"),
        item("disclosure", "is-details", 0, 664, width=590, title="На полях путешествия", sections=[
            section("is-reflection", "Путевые заметки", "Не пытаться увидеть всё за один день. Оставить место для случайных поворотов, долгого чая и ещё одной фотографии.", False, 112),
            section("is-checklist", "Что взять с собой", "Камеру, блокнот и свободное место для новых впечатлений. Это пример записей, а не список обязательных вещей."),
            section("is-sources", "Источники и авторы", sources, True, 320)]),
        item("audio", "is-audio", 650, 788, width=590, height=100, assetId=audio,
             title="Звук места · из исходного видео / CC0"),
    ]
    # A separate album is placed below the first frame; bookmarks focus the cover
    # and the photo workspace so screen captures do not require rearrangement.
    iceland += [
        note("is-album-label", "03  /  ФОТОАЛЬБОМ", 0, 1020, size=18, fill="#b6c9c9"),
        item("image", "is-album-mountain", 0, 1070, width=760, height=430.5, assetId=mountain,
             title="Пейзаж перед бурей · CC0"),
        item("image", "is-album-geyser", 800, 1070, width=440, height=247.5, assetId=poster,
             title="Кадр из видео гейзера · CC0"),
        note("is-album-caption", "Места остаются рядом.\nДаже когда поездка закончилась.", 800, 1350, width=440, size=30,
             fontFamily=serif, fill="#eef5f3"),
        item("link", "is-source-link", 0, 1540, width=590, height=110,
             title="Источник видео и фотографий", url="https://commons.wikimedia.org/wiki/File:Geisir.webm"),
        note("is-album-small", "Учебный альбом · маршрут и записи вымышлены", 650, 1560, size=17, fill="#90a9af"),
    ]
    iceland_scene = scene(iceland, glassPanels=True, bookmarks=[
        dict(id=uid("bookmark-cover"), name="01 · Обложка", camera=dict(x=95, y=18, scale=0.62)),
        dict(id=uid("bookmark-album"), name="02 · Фотоальбом", camera=dict(x=95, y=-610, scale=0.62))])

    norway = scene([
        note("no-label", "ЗИМНЯЯ ПАЛИТРА  /  МАТЕРИАЛЫ", 40, 30, size=16, fill="#e1edf4"),
        item("rectangle", "no-panel", 620, 345, width=1160, height=500, fill="#6f8699", strokeWidth=0,
             cornerRadius=40, glass=dict(enabled=True, blur=16, tint="#d7ecfc", opacity=0.18), locked=True),
        note("no-title", "Меньше шума.\nБольше света.", 95, 160, width=760, size=76,
             fontFamily=serif, glass=glass, shimmer=sparkle),
        item("circle", "no-orb", 1030, 330, scaleX=1.55, scaleY=1.55, fill="#91afc8", glass=glass, shimmer=sparkle),
        item("star", "no-star", 1050, 520, fill="#f0dfb1", stroke="#d0b884", scaleX=0.8, scaleY=0.8, shimmer=sparkle),
        note("no-caption", "Снежное переливание, стеклянные буквы\nи немного тёплого цвета среди холодных оттенков.", 100, 475,
             width=730, size=24, fill="#f1f6fb"),
        note("no-footer", "СВОЯ ПАЛИТРА ДЛЯ КАЖДОЙ СТРАНЫ", 42, 650, size=16, fill="#dce9f0"),
        item("line", "no-line", 40, 706, points=[0, 0, 1160, 0], stroke="#bdcfdb", opacity=0.6, strokeWidth=1),
    ], background="#526a80", backgroundType="gradient", secondary="#a5b7c8", angle=125,
       glassPanels=True, shimmer=dict(enabled=True, color="#ffffff", speed=0.6, intensity=0.7))

    text = "Киото: маленькие открытия\nИдея путешествия, которую можно дополнять постепенно.\nОдин день — одно место, которое хочется запомнить."
    japan = scene([
        note("jp-kicker", "ЯПОНИЯ  /  БЛОКНОТ ИДЕЙ", 45, 30, size=16, fill="#81715b"),
        note("jp-title", text, 45, 95, width=1140, size=38, fontFamily=serif, fill="#382f27", richText=[
            dict(text="Киото: "), dict(text="маленькие открытия", bold=True),
            dict(text="\nИдея путешествия, которую можно дополнять постепенно.\n"),
            dict(text="Один день — одно место", italic=True), dict(text=", которое хочется запомнить.")]),
        table("jp-table", 45, 345, [["Коллекция идей", "", ""], ["Утро", "Прогулка", "Заметить детали"],
              ["День", "Небольшое кафе", "Записать впечатления"], ["Вечер", "Фотоальбом", "Выбрать любимый кадр"]],
              [140, 360, 520], merges=[dict(row=0,column=0,rows=1,columns=3)], fontSize=22),
        item("disclosure", "jp-details", 45, 610, width=1020, title="Ещё несколько мыслей", sections=[
            section("jp-reading", "Истории, которые стоит сохранить", "Здесь могут быть цитаты, впечатления, планы и ссылки на источники. Раскрывающиеся разделы помогают оставить холст спокойным и понятным.", False, 110),
            section("jp-extra", "Отложенные идеи", "Оставить место для спонтанной прогулки.\nДобавить свои фотографии после поездки.")]),
        item("stroke", "jp-ink", 55, 290, points=[0,0,150,-5,300,2,480,-4], stroke="#bd9670", strokeWidth=5, tension=0.4),
    ], background="#f2ede3", textColor="#382f27", fontFamily=serif, glassPanels=False,
       guides=[dict(id=uid("jp-guide"), axis="x", value=45)], rulers=True)

    manifest = dict(format="atlas-canvas", version=1,
                    scenes=[dict(country_id="352", scene=iceland_scene),
                            dict(country_id="578", scene=norway), dict(country_id="392", scene=japan)],
                    assets=assets, preferences={})
    destination = ROOT / "demo/Atlas-Canvas-Iceland.atlas"
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        entries = {"manifest.json": json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode(), **payload}
        for name, data in entries.items():
            info = zipfile.ZipInfo(name, (2026, 11, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    (ROOT / "demo/scenes.json").write_text(json.dumps(manifest["scenes"], ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"{destination}: {destination.stat().st_size / 1024 / 1024:.2f} MiB; 3 countries, {len(assets)} assets")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    build(Path(sys.argv[1]).resolve())
