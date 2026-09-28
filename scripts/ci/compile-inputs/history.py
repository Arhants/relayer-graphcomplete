"""Recompute candidate history from retained GitHub checkout/job/tree evidence."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from audit import audit
from probe import digest, file_digest, selected, tracked


def guard(name):
    return (name in ('Cargo.toml', 'rust-toolchain.toml', '.github/workflows/ci.yml')
            or name.startswith(('.cargo/', '.github/actions/setup-rust-compilation/', '.github/actions/install-lbug-bundle/'))
            or name.startswith('scripts/ci/') or name.startswith('vendor/ladybug/')
            or name.startswith('crates/') and (name.endswith(('/build.rs', '/Cargo.toml')) or '/build_support/' in name))


def records(tree):
    if tree.get('truncated') is not False:
        raise ValueError('untruncated tree evidence required')
    result = []
    for row in tree['tree']:
        if row['type'] == 'tree':
            continue
        if row['type'] != 'blob' or row['mode'] not in ('100644', '100755'):
            raise ValueError('unsupported historical source entry')
        result.append([row['path'], row['mode'], row['sha']])
    if len({r[0] for r in result}) != len(result):
        raise ValueError('duplicate tree paths')
    return sorted(result)


def current_guards(repository):
    # Bind guards to actual reviewed bytes, including newly staged files. The
    # stager rejects untracked/nonregular/ambiguous entries before comparison.
    files = [r for r in tracked(repository) if guard(r['path'])]
    if not files:
        return []
    hashes = subprocess.check_output(['git', 'hash-object', '--no-filters', '--'] +
                                    [r['path'] for r in files], cwd=repository, text=True).splitlines()
    return [[r['path'], '100755' if r['mode'] & 0o111 else '100644', sha]
            for r, sha in zip(files, hashes, strict=True)]


def load_history(directory, repository, policy):
    runs = {r['id']: r for r in json.loads((directory / 'runs.json').read_text())}
    selected_runs = json.loads((directory / 'selection.json').read_text())
    expected_guards = current_guards(repository)
    rows = []
    for selection in selected_runs:
        run = runs[selection['id']]
        row = {'id': run['id'], 'attempt': selection['attempt'], 'completeDigest': None,
               'writerEligible': run.get('head_repository', {}).get('id') == run['repository']['id'],
               'unknowns': [], 'candidateDigest': None, 'contractApplicable': False,
               'accessibleRefs': None, 'checkoutVerified': False, 'treeComplete': False}
        used = [directory / 'runs.json', directory / 'selection.json']
        try:
            jobs_file = directory / f"{run['id']}-jobs.json"
            used.append(jobs_file)
            jobs = json.loads(jobs_file.read_text())
            if jobs['total_count'] != len(jobs['jobs']):
                raise ValueError('incomplete job listing')
            matches = [j for j in jobs['jobs'] if j['name'] == 'Fresh Rust tests' and j['run_attempt'] == row['attempt']]
            if len(matches) != 1:
                raise ValueError('selected job/attempt unavailable')
            job = matches[0]
            row.update(jobConclusion=job['conclusion'], jobStartedAt=job['started_at'], jobCompletedAt=job['completed_at'])
            log_file = directory / f"{run['id']}-rust.log"
            used.append(log_file)
            log = log_file.read_text()
            found = re.findall(r'git log -1 --format=%H\s*\n\S+ ([a-f0-9]{40})', log)
            if len(found) != 1:
                raise ValueError('actual checkout commit unavailable')
            sha = found[0]
            commit_file = directory / f'{sha}-commit.json'
            used.append(commit_file)
            commit = json.loads(commit_file.read_text())
            if commit['sha'] != sha:
                raise ValueError('checkout/commit mismatch')
            tree_file = directory / f"{commit['tree']['sha']}-tree.json"
            used.append(tree_file)
            tree = json.loads(tree_file.read_text())
            if tree['sha'] != commit['tree']['sha']:
                raise ValueError('commit/tree mismatch')
            files = records(tree)
            row.update(checkoutVerified=True, treeComplete=True, sourceCommit=sha, tree=tree['sha'],
                       contractApplicable=[r for r in files if guard(r[0])] == expected_guards,
                       candidateDigest=digest({'policy': policy, 'gitBlobProjection': [r for r in files if selected(r[0], policy)]}),
                       digestKind='candidate Git blob projection, not full compile identity')
            if run['event'] == 'push':
                row['cacheRef'] = 'refs/heads/' + run['head_branch']
                row['accessibleRefs'] = [row['cacheRef']]
            elif run['event'] == 'pull_request':
                refs = re.findall(r'git checkout --progress --force refs/remotes/(pull/\d+/merge)', log)
                if len(refs) != 1:
                    raise ValueError('PR cache ref unavailable')
                row['cacheRef'] = 'refs/' + refs[0]
                # Same PR visibility is known from checkout; base inheritance is
                # added only when the retained event includes a matching PR.
                row['accessibleRefs'] = [row['cacheRef']]
                number = int(refs[0].split('/')[1])
                prs = [p for p in run['pull_requests'] if p['number'] == number]
                if len(prs) == 1 and prs[0]['base']['repo']['id'] == run['repository']['id']:
                    row['accessibleRefs'].append('refs/heads/' + prs[0]['base']['ref'])
                else:
                    row['unknowns'].append('historical PR base/default inheritance unobserved; only same-ref visibility counted')
            else:
                raise ValueError('unsupported event visibility')
            if not row['contractApplicable']:
                row['unknowns'].append('current reviewed build/discovery guard set differs from historical recipe')
        except (OSError, KeyError, ValueError) as error:
            row['unknowns'].append(str(error))
        row['evidenceSha256'] = {p.name: file_digest(p) for p in used if p.exists()}
        rows.append(row)
    return {'normalized': rows, 'audit': audit(rows), 'currentGuardDigest': digest(expected_guards),
            'currentGuardKind': 'actual tracked workspace bytes and modes, including staged additions',
            'limitations': ['Retained 30-run window captured 2026-09-28 03:24 UTC; no new run sampling.',
                            'Unobserved refs, prior-window writers, cache version/publication/retention and external build inputs remain unknown.',
                            'Historical recipe applicability is conservative; this is not observed cache reuse.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--policy', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = load_history(args.evidence, args.repository, json.loads(args.policy.read_text()))
    args.output.write_text(json.dumps(result, indent=2) + '\n')
