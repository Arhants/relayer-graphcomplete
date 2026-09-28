"""Measure one real command; telemetry never substitutes for its exit status."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

try:
    import resource
except ImportError:
    resource = None

label, command, *arguments = sys.argv[1:]
started = time.monotonic()
try:
    completed = subprocess.run([command, *arguments], check=False)
    status = completed.returncode
except OSError as error:
    print(f"Cannot start {command}: {error}", file=sys.stderr)
    status = 127

try:
    usage = resource.getrusage(resource.RUSAGE_CHILDREN) if resource else None
    record = {
        "version": 1,
        "platform": sys.platform,
        "label": label,
        "program": Path(command).name,
        "exitCode": status if status >= 0 else None,
        "signal": -status if status < 0 else None,
        "wallSeconds": time.monotonic() - started,
        "userSeconds": usage.ru_utime if usage else None,
        "systemSeconds": usage.ru_stime if usage else None,
        # wait4 reports a maximum child RSS, not simultaneous process-tree RSS.
        "maxChildRssBytes": usage.ru_maxrss * (1 if sys.platform == "darwin" else 1024) if usage else None,
        "majorPageFaults": usage.ru_majflt if usage else None,
        "inputBlocks": usage.ru_inblock if usage else None,
        "outputBlocks": usage.ru_oublock if usage else None,
        "voluntaryContextSwitches": usage.ru_nvcsw if usage else None,
        "involuntaryContextSwitches": usage.ru_nivcsw if usage else None,
    }
    directory = Path(os.environ["RELAYER_CI_PROFILE_DIR"])
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"command-{os.getpid()}-{time.time_ns()}.json").write_text(json.dumps(record, indent=2) + "\n")
except Exception as error:
    print(f"CI resource profile unavailable: {error}", file=sys.stderr)

if status < 0:
    import signal
    if -status not in (signal.SIGKILL, signal.SIGSTOP):
        signal.signal(-status, signal.SIG_DFL)
    os.kill(os.getpid(), -status)
sys.exit(status)
