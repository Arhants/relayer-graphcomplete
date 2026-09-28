"""Prepare fresh registry sources from locked archives; never trust extracted caches."""
import hashlib
import json
import tarfile
import tomllib

MAX_EXPANDED = 2 * 1024**3


def prepare(lock, cache, destination):
    if destination.exists():
        raise ValueError('fresh registry destination required')
    packages = tomllib.loads(lock.read_text())['package']
    receipts, expanded = [], 0
    for package in packages:
        if 'source' not in package:
            continue
        if package['source'] != 'registry+https://github.com/rust-lang/crates.io-index':
            raise ValueError('unsupported dependency source')
        name = f"{package['name']}-{package['version']}"
        paths = list(cache.glob(f'*/{name}.crate'))
        if len(paths) != 1:
            raise ValueError(f'one locked archive required: {name}')
        archive = paths[0]
        with open(archive, 'rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        if actual != package['checksum']:
            raise ValueError(f'archive checksum mismatch: {name}')
        records, seen = [], set()
        with tarfile.open(archive, 'r:gz') as source:
            for member in source:
                parts = member.name.rstrip('/').split('/')
                if (not parts or parts[0] != name or any(p in ('', '.', '..') for p in parts)
                        or member.name.startswith('/') or '\\' in member.name):
                    raise ValueError('unsafe registry member path')
                if member.name in seen:
                    raise ValueError('duplicate registry member')
                seen.add(member.name)
                output = destination / archive.parent.name / member.name
                if member.isdir():
                    output.mkdir(parents=True, exist_ok=True)
                    continue
                if not member.isfile():
                    raise ValueError('nonregular registry member')
                expanded += member.size
                if expanded > MAX_EXPANDED:
                    raise ValueError('registry exceeds diagnostic budget')
                output.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                with source.extractfile(member) as incoming, open(output, 'xb') as outgoing:
                    while chunk := incoming.read(1024 * 1024):
                        outgoing.write(chunk)
                        digest.update(chunk)
                mode = 0o755 if member.mode & 0o111 else 0o644
                output.chmod(mode)
                records.append({'path': member.name, 'sha256': digest.hexdigest(), 'mode': mode})
        marker = destination / archive.parent.name / name / '.cargo-ok'
        if marker.exists():
            raise ValueError('archive contains reserved Cargo extraction marker')
        marker.write_text('{"v":1}')
        receipts.append({'package': name, 'archiveSha256': actual, 'files': records})
    return {'packages': receipts, 'expandedBytes': expanded,
            'completeDigest': None, 'note': 'Fresh locked registry sources only; native/toolchain/environment qualification separate.'}
