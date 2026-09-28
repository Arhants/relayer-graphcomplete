#!/usr/bin/env python3
"""Bounded input-read diagnostic, never a cache admission authority."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import time


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def file_digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def file_record(path, name):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError(f'nonregular input: {name}')
    return {'path': name, 'mode': stat.S_IMODE(info.st_mode), 'sha256': file_digest(path)}


def tracked(repository):
    raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=repository)
    extra = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=repository)
    if extra:
        raise ValueError('untracked repository input; use a clean source snapshot')
    records = []
    for entry in raw.split(b'\0'):
        if not entry:
            continue
        header, name = entry.split(b'\t', 1)
        mode, _, stage = header.split()
        if mode not in (b'100644', b'100755') or stage != b'0':
            raise ValueError('unsupported Git entry')
        name = os.fsdecode(name)
        path = repository / name
        if any((repository / parent).is_symlink() for parent in Path(name).parents):
            raise ValueError('linked source ancestor')
        records.append(file_record(path, name))
    return sorted(records, key=lambda r: r['path'])


def selected(name, policy):
    return name in policy['includeFiles'] or any(name.startswith(root) for root in policy['includeRoots'])


def inventory(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('input root must be a real directory')
    result = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            if (Path(directory) / name).is_symlink():
                raise ValueError('linked input directory')
        for name in files:
            path = Path(directory) / name
            result.append(file_record(path, path.relative_to(root).as_posix()))
    return sorted(result, key=lambda r: r['path'])


def stage(repository, destination, policy, full=False):
    if destination.exists():
        raise ValueError('stage destination must be absent')
    records = tracked(repository)
    chosen = records if full else [r for r in records if selected(r['path'], policy)]
    present = {r['path'] for r in chosen}
    if not set(policy['includeFiles']).issubset(present):
        raise ValueError('required source input missing')
    destination.mkdir(parents=True)
    for record in chosen:
        source, output = repository / record['path'], destination / record['path']
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, output)
        output.chmod(record['mode'])
    if inventory(destination) != chosen:
        raise ValueError('source changed while staging')
    return {'version': 1, 'mode': 'full-control' if full else 'projected', 'policyDigest': digest(policy),
            'trackedSourceDigest': digest(records), 'candidateCompileDigest': digest([r for r in records if selected(r['path'], policy)]),
            'stagedFiles': chosen, 'excludedFiles': [r['path'] for r in records if r not in chosen],
            'freshRuntimeInputs': [r for r in records if any(r['path'].startswith(p) for p in policy['runtimeRoots'])],
            'completeDigest': None, 'unqualified': policy['unqualified']}


def context(image, toolchain, environment, native, registry):
    if not image.startswith('sha256:') or len(image) != 71 or any(c not in '0123456789abcdef' for c in image[7:]):
        raise ValueError('pinned image digest required')
    return {'image': image, 'toolchain': toolchain, 'environment': environment,
            'nativeFiles': inventory(native), 'registryManifestSha256': file_digest(registry)}


def validate(source, manifest, actual_context, expected_context):
    if inventory(source) != manifest['stagedFiles']:
        raise ValueError('staged source identity mismatch')
    if actual_context != expected_context:
        raise ValueError('native/toolchain/image/environment/registry identity mismatch')
    if manifest.get('completeDigest') is not None:
        raise ValueError('diagnostic cannot certify complete identity')


def execute(source, manifest, actual_context, expected_context, command, environment, output):
    # Host launcher owns isolation and image verification. This subprocess boundary
    # checks the declared recipe, but does not claim to sandbox arbitrary programs.
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    receipt = {'completeDigest': None, 'command': command, 'status': 'rejected'}
    try:
        validate(source, manifest, actual_context(), expected_context)
        if environment != expected_context['environment']:
            raise ValueError('execution environment mismatch')
        with open(output / 'stdout.log', 'wb') as stdout, open(output / 'stderr.log', 'wb') as stderr:
            result = subprocess.run(command, cwd=source, env=environment, stdout=stdout, stderr=stderr)
        receipt.update(status='completed', exitCode=result.returncode)
        # No mutation can silently turn the original input receipt into a pass.
        validate(source, manifest, actual_context(), expected_context)
        return result.returncode
    except Exception as error:
        receipt.update(status='rejected', error=str(error))
        return 1
    finally:
        receipt['elapsedSeconds'] = time.monotonic() - started
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--policy', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--full', action='store_true')
    args = parser.parse_args()
    result = stage(args.repository, args.destination, json.loads(args.policy.read_text()), args.full)
    args.manifest.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
