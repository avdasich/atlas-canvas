//! Extra fields introduced in scene format 5. Shared by live saves and archives.
use crate::storage::Result;
use crate::validation::is_color;
use serde_json::Value;

fn in_range(value: &Value, min: f64, max: f64) -> bool {
    value
        .as_f64()
        .is_some_and(|number| (min..=max).contains(&number))
}

pub(crate) fn validate_item_features(item: &Value) -> Result<()> {
    let kind = item["kind"].as_str().unwrap_or_default();
    if let Some(crop) = item.get("crop") {
        if kind != "image"
            || !in_range(&crop["x"], 0.0, 1.0)
            || !in_range(&crop["y"], 0.0, 1.0)
            || !in_range(&crop["width"], 0.001, 1.0)
            || !in_range(&crop["height"], 0.001, 1.0)
            || crop["x"].as_f64().unwrap() + crop["width"].as_f64().unwrap() > 1.0 + 1e-9
            || crop["y"].as_f64().unwrap() + crop["height"].as_f64().unwrap() > 1.0 + 1e-9
        {
            return Err("Повреждена область обрезки".into());
        }
    }
    if kind == "disclosure" {
        let sections = item["sections"]
            .as_array()
            .ok_or("Отсутствуют разделы сноски")?;
        if sections.is_empty() || sections.len() > 100 {
            return Err("Некорректное число разделов сноски".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for section in sections {
            let id = section["id"].as_str().ok_or("Раздел без ID")?;
            if id.is_empty()
                || id.encode_utf16().count() > 80
                || !ids.insert(id)
                || section["title"]
                    .as_str()
                    .is_none_or(|s| s.encode_utf16().count() > 500)
                || section["content"]
                    .as_str()
                    .is_none_or(|s| s.encode_utf16().count() > 100000)
                || section["collapsed"].as_bool().is_none()
                || !in_range(&section["height"], 60.0, 1000.0)
            {
                return Err("Повреждены разделы сноски".into());
            }
        }
    } else if item.get("sections").is_some() {
        return Err("Разделы допустимы только у сноски".into());
    }
    let supported = [
        "note",
        "rectangle",
        "square",
        "circle",
        "ellipse",
        "star",
        "line",
        "arrow",
        "stroke",
    ]
    .contains(&kind);
    if let Some(glass) = item.get("glass") {
        if !supported
            || glass["enabled"].as_bool().is_none()
            || !in_range(&glass["blur"], 0.0, 40.0)
            || !in_range(&glass["opacity"], 0.0, 1.0)
            || !is_color(&glass["tint"])
        {
            return Err("Повреждён материал объекта".into());
        }
    }
    if let Some(shimmer) = item.get("shimmer") {
        if !supported
            || shimmer["enabled"].as_bool().is_none()
            || !in_range(&shimmer["intensity"], 0.0, 1.0)
            || !in_range(&shimmer["speed"], 0.1, 2.0)
            || !is_color(&shimmer["color"])
        {
            return Err("Повреждены блестяшки объекта".into());
        }
    }
    Ok(())
}
