//! Validation shared by live saves, migration, and portable archive imports.
use crate::storage::{Result, err};
use serde_json::Value;
pub(crate) fn validate_id(id: &str) -> Result<()> {
    if id.len() == 3 && id.bytes().all(|b| b.is_ascii_digit()) {
        Ok(())
    } else {
        Err("Недопустимый код страны".into())
    }
}
pub(crate) fn validate_scene(raw: &str) -> Result<bool> {
    let v: Value = serde_json::from_str(raw).map_err(err)?;
    if !matches!(v["schemaVersion"].as_u64(), Some(2 | 3 | 4)) {
        return Err("Версия холста не поддерживается".into());
    }
    let items = v["items"].as_array().ok_or("Отсутствует список объектов")?;
    for k in ["x", "y", "scale"] {
        if v["camera"][k].as_f64().is_none() {
            return Err("Повреждена камера".into());
        }
    }
    if v["camera"]["scale"].as_f64().unwrap() <= 0.0
        || !v["theme"].is_object()
        || v["theme"]["fontFamily"].as_str().is_none()
    {
        return Err("Повреждены настройки сцены".into());
    }
    validate_theme(&v["theme"])?;
    let mut ids = std::collections::BTreeSet::new();
    for item in items {
        validate_item(item)?;
        if !ids.insert(item["id"].as_str().unwrap()) {
            return Err("Повторный ID объекта".into());
        }
    }
    Ok(!items.is_empty())
}
pub(crate) fn validate_asset_id(id: &str) -> Result<()> {
    if id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        Ok(())
    } else {
        Err("Недопустимый ID файла".into())
    }
}

fn is_color(c: &Value) -> bool {
    c.as_str().is_some_and(|s| {
        s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
    })
}

fn validate_theme(theme: &Value) -> Result<()> {
    if !is_color(&theme["background"])
        || !matches!(
            theme["pattern"].as_str(),
            Some("dots" | "grid" | "lines" | "none")
        )
    {
        return Err("Повреждено оформление сцены".into());
    }
    if let Some(s) = theme.get("shimmer") {
        if s["enabled"].as_bool().is_none()
            || s["intensity"]
                .as_f64()
                .is_none_or(|n| !(0.0..=1.0).contains(&n))
            || s["speed"]
                .as_f64()
                .is_none_or(|n| !(0.1..=2.0).contains(&n))
            || !is_color(&s["color"])
        {
            return Err("Повреждены настройки переливания".into());
        }
    }
    for key in [
        "snap",
        "snapGuides",
        "rulers",
        "minimap",
        "drawShapes",
        "repeatShape",
    ] {
        if theme.get(key).is_some_and(|n| n.as_bool().is_none()) {
            return Err("Некорректный переключатель оформления".into());
        }
    }
    if let Some(guides) = theme.get("guides") {
        let guides = guides.as_array().ok_or("Повреждены направляющие")?;
        if guides.len() > 100
            || guides.iter().any(|g| {
                g["id"].as_str().is_none()
                    || !matches!(g["axis"].as_str(), Some("x" | "y"))
                    || g["value"].as_f64().is_none()
            })
        {
            return Err("Повреждены направляющие".into());
        }
    }
    if let Some(marks) = theme.get("bookmarks") {
        let marks = marks.as_array().ok_or("Повреждены закладки")?;
        if marks.len() > 100
            || marks.iter().any(|b| {
                b["id"].as_str().is_none()
                    || b["name"].as_str().is_none_or(|s| s.len() > 320)
                    || ["x", "y", "scale"]
                        .iter()
                        .any(|k| b["camera"][k].as_f64().is_none())
                    || b["camera"]["scale"].as_f64().is_none_or(|n| n <= 0.0)
            })
        {
            return Err("Повреждены закладки".into());
        }
    }
    for key in ["secondary", "patternColor", "textColor"] {
        if theme.get(key).is_some_and(|c| !is_color(c)) {
            return Err("Некорректный цвет оформления".into());
        }
    }
    for (key, min, max) in [
        ("patternOpacity", 0.0, 1.0),
        ("backgroundOpacity", 0.0, 1.0),
        ("imageScale", 0.1, 10.0),
        ("gridSize", 4.0, 200.0),
    ] {
        if theme
            .get(key)
            .is_some_and(|n| n.as_f64().is_none_or(|n| n < min || n > max))
        {
            return Err("Некорректный параметр фона".into());
        }
    }
    for key in ["angle", "imageX", "imageY"] {
        if theme.get(key).is_some_and(|n| n.as_f64().is_none()) {
            return Err("Некорректное положение фона".into());
        }
    }
    if let Some(mode) = theme.get("imageMode") {
        if !matches!(
            mode.as_str(),
            Some("cover" | "contain" | "repeat" | "stretch")
        ) {
            return Err("Неизвестное размещение фона".into());
        }
    }
    if let Some(kind) = theme.get("backgroundType") {
        if !matches!(kind.as_str(), Some("solid" | "gradient" | "image")) {
            return Err("Неизвестный тип фона".into());
        }
    }
    if let Some(asset) = theme.get("backgroundAssetId") {
        validate_asset_id(asset.as_str().ok_or("Нет ID фонового изображения")?)?;
    }
    Ok(())
}
fn validate_item(item: &Value) -> Result<()> {
    let id = item["id"].as_str().ok_or("Объект без ID")?;
    if id.is_empty() || item["x"].as_f64().is_none() || item["y"].as_f64().is_none() {
        return Err("Некорректный объект".into());
    }
    let kind = item["kind"].as_str().ok_or("Нет типа объекта")?;
    if ![
        "note",
        "rectangle",
        "square",
        "circle",
        "ellipse",
        "star",
        "arrow",
        "line",
        "stroke",
        "image",
        "table",
        "video",
        "audio",
        "link",
    ]
    .contains(&kind)
    {
        return Err("Неизвестный тип объекта".into());
    }
    for key in [
        "scaleX",
        "scaleY",
        "width",
        "height",
        "fontSize",
        "lineHeight",
    ] {
        if let Some(n) = item.get(key) {
            if n.as_f64().is_none_or(|v| v <= 0.0) {
                return Err("Некорректный размер объекта".into());
            }
        }
    }
    for key in ["rotation", "strokeWidth", "cornerRadius", "shadowBlur"] {
        if item.get(key).is_some_and(|v| v.as_f64().is_none()) {
            return Err("Повреждена геометрия".into());
        }
    }
    if item
        .get("opacity")
        .is_some_and(|v| v.as_f64().is_none_or(|v| !(0.0..=1.0).contains(&v)))
    {
        return Err("Некорректная прозрачность".into());
    }
    if let Some(runs) = item.get("richText") {
        let runs = runs.as_array().ok_or("Повреждено форматирование текста")?;
        if runs.len() > 100000 {
            return Err("Слишком много фрагментов текста".into());
        }
        let mut content = String::new();
        for run in runs {
            content.push_str(run["text"].as_str().ok_or("Повреждён фрагмент текста")?);
            for key in ["bold", "italic", "underline"] {
                if run.get(key).is_some_and(|v| v.as_bool().is_none()) {
                    return Err("Повреждён стиль фрагмента".into());
                }
            }
            if let Some(href) = run.get("href") {
                let url =
                    tauri::Url::parse(href.as_str().ok_or("Повреждена ссылка")?).map_err(err)?;
                if !["http", "https"].contains(&url.scheme()) {
                    return Err("Недопустимая ссылка в тексте".into());
                }
            }
        }
        if item["content"].as_str() != Some(&content) {
            return Err("Текст не совпадает с фрагментами".into());
        }
    }
    if item.get("textBackground").is_some_and(|v| !is_color(v)) {
        return Err("Некорректный фон заметки".into());
    }
    if item
        .get("tension")
        .is_some_and(|n| n.as_f64().is_none_or(|n| !(0.0..=1.0).contains(&n)))
    {
        return Err("Некорректное сглаживание".into());
    }
    if let Some(dash) = item.get("dash") {
        let d = dash.as_array().ok_or("Некорректный пунктир")?;
        if d.len() > 8
            || d.iter()
                .any(|v| v.as_f64().is_none_or(|n| !(0.0..=100.0).contains(&n)))
        {
            return Err("Некорректный пунктир".into());
        }
    }
    if kind == "note" && item["content"].as_str().is_none() {
        return Err("Повреждена заметка".into());
    }
    if ["image", "video", "audio"].contains(&kind) {
        validate_asset_id(item["assetId"].as_str().ok_or("Нет ссылки на вложение")?)?;
    }
    if ["stroke", "line", "arrow"].contains(&kind) {
        let p = item["points"]
            .as_array()
            .ok_or("Отсутствуют точки рисунка")?;
        if p.len() < 2 || p.len() % 2 != 0 || p.iter().any(|n| n.as_f64().is_none()) {
            return Err("Повреждены точки рисунка".into());
        }
    }
    if kind == "link" {
        let u = tauri::Url::parse(item["url"].as_str().ok_or("Нет адреса ссылки")?).map_err(err)?;
        if !["http", "https"].contains(&u.scheme()) {
            return Err("Недопустимый адрес ссылки".into());
        }
    }
    if kind == "table" {
        validate_table(&item["table"])?;
    }
    Ok(())
}
fn validate_table(t: &Value) -> Result<()> {
    let rows = t["cells"].as_array().ok_or("Нет ячеек таблицы")?;
    let columns = t["columnWidths"].as_array().ok_or("Нет столбцов таблицы")?;
    let heights = t["rowHeights"].as_array().ok_or("Нет строк таблицы")?;
    if rows.is_empty()
        || rows.len() > 200
        || columns.is_empty()
        || columns.len() > 50
        || rows.len() != heights.len()
    {
        return Err("Повреждена структура таблицы".into());
    }
    if columns
        .iter()
        .any(|n| n.as_f64().is_none_or(|n| !(40.0..=2000.0).contains(&n)))
        || heights
            .iter()
            .any(|n| n.as_f64().is_none_or(|n| !(24.0..=2000.0).contains(&n)))
    {
        return Err("Повреждены размеры ячеек".into());
    }
    for row in rows {
        let row = row.as_array().ok_or("Повреждена строка")?;
        if row.len() != columns.len() {
            return Err("Разное число столбцов".into());
        }
        for c in row {
            if c["text"].as_str().is_none_or(|s| s.len() > 400000) {
                return Err("Повреждён текст ячейки".into());
            }
            for key in ["fill", "color"] {
                if c.get(key).is_some_and(|v| !is_color(v)) {
                    return Err("Некорректный цвет ячейки".into());
                }
            }
        }
    }
    if t.get("headerFill").is_some_and(|v| !is_color(v)) {
        return Err("Некорректный цвет заголовка".into());
    }
    if let Some(merges) = t.get("merges") {
        let merges = merges.as_array().ok_or("Повреждены объединения ячеек")?;
        if merges.len() > 5000 {
            return Err("Слишком много объединений".into());
        }
        let mut occupied = std::collections::BTreeSet::new();
        for m in merges {
            let r = m["row"].as_u64().ok_or("Некорректная строка объединения")? as usize;
            let c = m["column"]
                .as_u64()
                .ok_or("Некорректный столбец объединения")? as usize;
            let nr = m["rows"]
                .as_u64()
                .ok_or("Некорректная высота объединения")? as usize;
            let nc = m["columns"]
                .as_u64()
                .ok_or("Некорректная ширина объединения")? as usize;
            if nr == 0
                || nc == 0
                || r >= rows.len()
                || c >= columns.len()
                || nr > rows.len() - r
                || nc > columns.len() - c
            {
                return Err("Объединение за границами таблицы".into());
            }
            for row in r..r + nr {
                for col in c..c + nc {
                    if !occupied.insert((row, col)) {
                        return Err("Объединения ячеек пересекаются".into());
                    }
                }
            }
        }
    }
    for key in ["background", "borderColor", "color"] {
        if !is_color(&t[key]) {
            return Err("Повреждено оформление таблицы".into());
        }
    }
    for (key, min, max) in [
        ("fontSize", 6.0, 200.0),
        ("padding", 0.0, 100.0),
        ("radius", 0.0, 100.0),
        ("borderWidth", 0.0, 20.0),
    ] {
        if t[key].as_f64().is_none_or(|n| n < min || n > max) {
            return Err("Некорректный параметр таблицы".into());
        }
    }
    if t["header"].as_bool().is_none() {
        return Err("Некорректный заголовок таблицы".into());
    }
    Ok(())
}
