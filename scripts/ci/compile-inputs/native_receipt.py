"""Receipt follows successful unchanged native verification; no alternate verifier."""
import json
import os
from pathlib import Path
import subprocess
import sys
from probe import inventory, file_digest

native, archive, output = map(Path, sys.argv[1:])
receipt = {'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'run': os.environ.get('GITHUB_RUN_ID'), 'attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
           'toolchain': subprocess.check_output(['rustc', '-vV'], text=True),
           'archiveSha256': file_digest(archive), 'nativeFiles': inventory(native),
           'authority': 'dependency preparation only; consumer must repeat production native verification'}
output.write_text(json.dumps(receipt, indent=2) + '\n')
