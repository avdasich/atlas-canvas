"""Validate the public demo's ZIP integrity and media references; print JSON for Node."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
file = root / 'demo/Atlas-Canvas-Iceland.atlas'
assert file.stat().st_size < 12 * 1024 * 1024, 'Demo unexpectedly large'
with zipfile.ZipFile(file) as archive:
    assert archive.testzip() is None, 'ZIP CRC mismatch'
    manifest = json.loads(archive.read('manifest.json'))
    assert manifest['format'] == 'atlas-canvas' and manifest['version'] == 1
    assert manifest['preferences'] == {}, 'Demo must not overwrite global preferences'
    assert len(manifest['scenes']) == 3
    assert {s['country_id'] for s in manifest['scenes']} == {'352', '578', '392'}
    scenes = json.loads((root / 'demo/scenes.json').read_text(encoding='utf8'))
    assert scenes == manifest['scenes'], 'Source scenes and archive differ'
    ids, paths = set(), {'manifest.json'}
    for asset in manifest['assets']:
        assert asset['id'] not in ids
        ids.add(asset['id'])
        for key, digest in [('internal_path', 'sha256'), ('preview_path', 'preview_sha256')]:
            name = asset[key]
            assert name.startswith(f"assets/{asset['id']}.") and '..' not in name
            data = archive.read(name)
            assert hashlib.sha256(data).hexdigest() == asset[digest], name
            paths.add(name)
            if key == 'internal_path':
                assert len(data) == asset['bytes']
                if asset['mime'] == 'video/mp4':
                    assert data[4:8] == b'ftyp' and b'avc1' in data, 'H.264 MP4 required'
    assert set(archive.namelist()) == paths, 'Unexpected or missing files'
    assert len(archive.namelist()) == len(paths), 'Repeated ZIP entry'
    def references(value):
        if isinstance(value, list):
            return set().union(*(references(v) for v in value)) if value else set()
        if not isinstance(value, dict):
            return set()
        found = set()
        for key, val in value.items():
            if key in ('assetId', 'backgroundAssetId'):
                found.add(val)
            elif key == 'fontFamily' and val.startswith('AtlasFont-'):
                found.add(val.removeprefix('AtlasFont-'))
            else:
                found |= references(val)
        return found
    assert references(manifest['scenes']) == ids, 'Dangling or unused media references'
    assert {'video/mp4', 'audio/wav', 'image/jpeg', 'font/ttf'} <= {a['mime'] for a in manifest['assets']}
print(json.dumps(dict(manifest=manifest, bytes=file.stat().st_size)))
