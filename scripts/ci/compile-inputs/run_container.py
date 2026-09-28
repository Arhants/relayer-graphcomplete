"""Container half of the bounded diagnostic. Invoke only through launch.py."""
import json
import os
from pathlib import Path
import subprocess
import sys
from probe import context, execute, inventory

COMMAND = ['cargo', 'test', '--workspace', '--frozen', '--no-run', '--message-format=json']


def main():
    recipe = json.loads(Path('/recipe/recipe.json').read_text())
    manifest = json.loads(Path('/recipe/source.json').read_text())
    source = Path('/workspace')
    if dict(os.environ) != recipe['context']['environment']:
        raise ValueError('container inherited an undeclared environment')
    # Hash the actual readonly inputs, not just the supplied receipt.
    if inventory(Path('/cargo/registry')) != recipe['registryFiles']:
        raise ValueError('registry input inventory mismatch')
    if list(Path('/target').iterdir()):
        raise ValueError('target must be empty')
    Path('/tmp/home').mkdir()
    def actual():
        return context(recipe['context']['image'], subprocess.check_output(
            ['rustc', '-vV'], cwd=source, text=True), dict(os.environ),
            Path('/native'), Path('/recipe/registry.json'))
    result = execute(source, manifest, actual, recipe['context'], COMMAND,
                     dict(os.environ), Path('/evidence/compile'))
    records = []
    log = Path('/evidence/compile/stdout.log')
    if log.exists():
        for line in log.read_text().splitlines():
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if message.get('reason') == 'compiler-artifact':
                records.append({key: message.get(key) for key in
                                ('package_id', 'target', 'profile', 'features', 'fresh', 'executable')})
    Path('/evidence/artifacts.json').write_text(json.dumps(records, indent=2) + '\n')
    if inventory(Path('/cargo/registry')) != recipe['registryFiles']:
        raise ValueError('registry changed during execution')
    return result


if __name__ == '__main__':
    sys.exit(main())
