#!/usr/bin/env python3
"""One sequential full/projected compile experiment; requires a factory grant."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tarfile
import time
import uuid
from probe import context, file_digest, file_record, inventory, stage
from registry import prepare

IMAGE = 'sha256:9051430ada55d8edc9751e8e8a61811c7d29a41a502a2d4bedc3d762211cbeb8'
ENVIRONMENT = {
    'PATH': '/opt/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'HOME': '/tmp/home', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TMPDIR': '/tmp',
    'RUSTUP_HOME': '/opt/rustup', 'CARGO_HOME': '/cargo', 'CARGO_TARGET_DIR': '/target',
    'CARGO_INCREMENTAL': '0', 'CARGO_BUILD_JOBS': '2', 'CARGO_NET_OFFLINE': 'true',
    'CARGO_PROFILE_DEV_DEBUG': 'line-tables-only', 'CARGO_PROFILE_TEST_DEBUG': 'line-tables-only',
    'LBUG_LIBRARY_DIR': '/native/lib', 'LBUG_INCLUDE_DIR': '/native/include',
}


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def extract_native(archive, receipt, destination):
    if file_digest(archive) != receipt['archiveSha256']:
        raise ValueError('native transport checksum mismatch')
    expected = {r['path']: r for r in receipt['nativeFiles']}
    seen = set()
    destination.mkdir()
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            name = member.name.removeprefix('./')
            if member.isdir():
                # Directories are created from allowlisted regular files only.
                continue
            if name not in expected or name in seen or not member.isfile():
                raise ValueError('unexpected native archive member')
            if Path(name).is_absolute() or '..' in Path(name).parts:
                raise ValueError('unsafe native member')
            seen.add(name)
            output = destination / name
            output.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as incoming, open(output, 'xb') as outgoing:
                shutil.copyfileobj(incoming, outgoing)
            output.chmod(expected[name]['mode'])
    if inventory(destination) != receipt['nativeFiles']:
        raise ValueError('native consumer inventory mismatch')


def copy_registry_inputs(source, destination):
    # Keep Cargo's known bookkeeping tag in the declared readonly inventory.
    # Existing extracted sources and home/config credentials are never copied.
    file_record(source / 'CACHEDIR.TAG', 'CACHEDIR.TAG')
    shutil.copyfile(source / 'CACHEDIR.TAG', destination / 'CACHEDIR.TAG')
    for name in ('cache', 'index'):
        inventory(source / name)
        shutil.copytree(source / name, destination / name)


def cleanup_container(owned, receipt):
    """A failed stop/inspect must not suppress forced removal of our container."""
    try:
        subprocess.run(['docker', 'stop', '--time', '2', owned], capture_output=True, timeout=10)
    except Exception as error:
        receipt.setdefault('cleanupErrors', []).append(str(error))
    try:
        state = subprocess.run(['docker', 'inspect', owned], capture_output=True, text=True, timeout=10)
        if state.returncode == 0:
            receipt.setdefault('containers', []).append(json.loads(state.stdout)[0])
    except Exception as error:
        receipt.setdefault('cleanupErrors', []).append(str(error))
    finally:
        try:
            subprocess.run(['docker', 'rm', '--force', owned], capture_output=True, timeout=10, check=True)
        except Exception as error:
            receipt.setdefault('cleanupErrors', []).append(str(error))
            receipt['unreleasedContainer'] = owned
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--registry', type=Path, required=True, help='Cargo registry with index/cache; src is ignored')
    parser.add_argument('--native-export', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--deadline-seconds', type=int, required=True)
    parser.add_argument('--grant', required=True, help='Recorded factory grant identifier; not an authority bypass')
    args = parser.parse_args()
    if not 60 <= args.deadline_seconds <= 1200:
        raise ValueError('bounded 60–1200 second envelope required')
    if args.output.exists() or os.getuid() == 0:
        raise ValueError('new evidence directory and nonroot host required')
    args.repository = args.repository.resolve()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True)
    started = time.monotonic()
    deadline = started + args.deadline_seconds
    receipt = {'grant': args.grant, 'image': IMAGE, 'completeDigest': None, 'phases': [], 'status': 'preparing'}
    active = None
    def remaining():
        seconds = deadline - time.monotonic()
        if seconds <= 0:
            raise TimeoutError('experiment deadline reached')
        return seconds
    def run(command, **kwargs):
        return subprocess.run(command, timeout=remaining(), check=True, **kwargs)
    def container(source, cargo, evidence, recipe=None):
        nonlocal active
        active = 'compile-input-' + uuid.uuid4().hex[:12]
        (args.output / 'active-container.txt').write_text(active + '\n')
        command = ['docker', 'run', '--name', active, '--pull', 'never', '--network', 'none',
                   '--read-only', '--user', f'{os.getuid()}:{os.getgid()}', '--cpus', '2',
                   '--memory', '8g', '--memory-swap', '8g', '--pids-limit', '512', '--cap-drop', 'ALL',
                   '--security-opt', 'no-new-privileges', '--workdir', '/workspace',
                   '--tmpfs', '/tmp:rw,nosuid,nodev,size=1g', '--tmpfs', '/run:rw,nosuid,nodev,size=16m']
        mounts = [(source, '/workspace', True), (cargo, '/cargo', False),
                  (native, '/native', True), (evidence, '/evidence', False)]
        mounts.append((registry, '/cargo/registry', True))
        if recipe:
            mounts += [(recipe, '/recipe', True), (diagnostic, '/diagnostic', True),
                       (recipe.parent / 'target', '/target', False)]
        for host, target, readonly in mounts:
            if not host.exists() or ',' in str(host):
                raise ValueError('missing or unsupported bind path')
            command += ['--mount', f'type=bind,source={host},target={target}' + (',readonly' if readonly else '')]
        return command + [IMAGE, 'env', '-i'] + [f'{key}={value}' for key, value in ENVIRONMENT.items()]
    def finish_container():
        nonlocal active
        if active:
            cleanup_container(active, receipt)
            active = None
    def expired(_signum, _frame):
        raise TimeoutError('experiment deadline reached during preparation or execution')
    signal.signal(signal.SIGALRM, expired)
    try:
        signal.setitimer(signal.ITIMER_REAL, args.deadline_seconds)
        actual_image = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', IMAGE], text=True, timeout=remaining()).strip()
        if actual_image != IMAGE:
            raise ValueError('Docker image identity mismatch')
        diagnostic = args.output / 'diagnostic'
        diagnostic.mkdir()
        for name in ('probe.py', 'run_container.py'):
            shutil.copyfile(Path(__file__).with_name(name), diagnostic / name)
        receipt['diagnosticFiles'] = inventory(diagnostic)
        policy = json.loads(Path(__file__).with_name('policy.json').read_text())
        sources = {}
        for name, full in (('full', True), ('projected', False)):
            phase = args.output / name
            phase.mkdir()
            source = phase / 'source'
            sources[name] = stage(args.repository, source, policy, full)
            for directory in ('cargo/registry/src', 'cargo/registry/index', 'cargo/registry/cache', 'evidence', 'target', 'recipe'):
                (phase / directory).mkdir(parents=True, exist_ok=True)
        write(args.output / 'sources.json', sources)
        registry = args.output / 'registry'
        registry.mkdir()
        copy_registry_inputs(args.registry, registry)
        registry_receipt = prepare(args.repository / 'Cargo.lock', registry / 'cache', registry / 'src')
        registry_files = inventory(registry)
        write(args.output / 'registry.json', registry_receipt)
        native = args.output / 'native'
        producer = json.loads((args.native_export / 'receipt.json').read_text())
        extract_native(args.native_export / 'native.tar.gz', producer, native)
        receipt['nativeProducer'] = producer
        # Unchanged production verifier runs against full source before either compilation.
        phase = args.output / 'full'
        command = container(phase / 'source', phase / 'cargo', phase / 'evidence')
        command += ['sh', '-c', 'rustc -vV > /evidence/toolchain.txt && node scripts/ci/lbug-artifact.mjs verify --repository /workspace --artifact-dir /native --platform Linux-X64 --rustc-release "$(rustc -vV | sed -n \'s/^release: //p\')"']
        with open(phase / 'evidence/native-verify.log', 'wb') as log:
            run(command, stdout=log, stderr=subprocess.STDOUT)
        finish_container()
        toolchain = (phase / 'evidence/toolchain.txt').read_text()
        expected = context(IMAGE, toolchain, ENVIRONMENT, native, args.output / 'registry.json')
        receipt['context'] = expected
        for name in ('full', 'projected'):
            phase = args.output / name
            recipe = phase / 'recipe'
            write(recipe / 'source.json', sources[name])
            write(recipe / 'recipe.json', {'context': expected, 'registryFiles': registry_files})
            shutil.copyfile(args.output / 'registry.json', recipe / 'registry.json')
            command = container(phase / 'source', phase / 'cargo', phase / 'evidence', recipe)
            command += ['python3', '-B', '/diagnostic/run_container.py']
            phase_start = time.monotonic()
            with open(phase / 'evidence/container.log', 'wb') as log:
                result = subprocess.run(command, timeout=remaining(), stdout=log, stderr=subprocess.STDOUT)
            receipt['phases'].append({'name': name, 'containerExit': result.returncode,
                                      'elapsedSeconds': time.monotonic() - phase_start})
            finish_container()
            write(args.output / 'receipt.json', receipt)
            if result.returncode != 0 and name == 'full':
                raise ValueError('full-source control failed; treatment would be uninterpretable')
        receipt['status'] = 'completed'
    except Exception as error:
        receipt.update(status='stopped', error=str(error))
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        try:
            finish_container()
        finally:
            receipt['elapsedSeconds'] = time.monotonic() - started
            write(args.output / 'receipt.json', receipt)
    return 0 if not receipt.get('cleanupErrors') and receipt['status'] == 'completed' and all(p['containerExit'] == 0 for p in receipt['phases']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
