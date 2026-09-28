import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ReadPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        (self.repo / 'input.txt').write_text('declared')
        (self.repo / 'excluded.txt').write_text('ambient')
        subprocess.run(['git', 'add', '.'], cwd=self.repo, check=True)
        self.policy = {'includeFiles': ['input.txt'], 'includeRoots': [], 'runtimeRoots': [],
                       'unqualified': ['Optional excluded reads may change behavior']}
        self.source = self.root / 'stage'
        self.manifest = probe.stage(self.repo, self.source, self.policy)
        self.env = {'PATH': os.environ['PATH']}
        self.context = {'image': 'sha256:' + 'a' * 64, 'toolchain': 'pinned', 'environment': self.env,
                        'nativeFiles': [{'sha256': 'native'}], 'registryManifestSha256': 'registry'}

    def run_program(self, program, actual=None):
        output = self.root / ('evidence-' + str(len(list(self.root.glob('evidence-*')))))
        code = probe.execute(self.source, self.manifest, lambda: actual or self.context, self.context,
                             [sys.executable, '-c', program], self.env, output)
        return code, json.loads((output / 'receipt.json').read_text()), (output / 'stdout.log')

    def test_real_declared_read_passes_excluded_required_read_fails(self):
        code, receipt, stdout = self.run_program("print(open('input.txt').read())")
        self.assertEqual(code, 0)
        self.assertEqual(stdout.read_text().strip(), 'declared')
        code, receipt, _ = self.run_program("print(open('excluded.txt').read())")
        self.assertNotEqual(code, 0)
        self.assertEqual(receipt['status'], 'completed')
        self.assertIsNone(receipt['completeDigest'])

    def test_optional_read_is_observed_not_certified_irrelevant(self):
        code, receipt, stdout = self.run_program("from pathlib import Path; print(Path('excluded.txt').exists())")
        self.assertEqual(code, 0)
        self.assertEqual(stdout.read_text().strip(), 'False')
        self.assertIsNone(receipt['completeDigest'])
        self.assertIn('Optional', self.manifest['unqualified'][0])
        before = self.manifest['candidateCompileDigest']
        (self.repo / 'excluded.txt').write_text('changed ambient')
        after = probe.stage(self.repo, self.root / 'stage2', self.policy)
        self.assertEqual(before, after['candidateCompileDigest'])
        self.assertNotEqual(self.manifest['trackedSourceDigest'], after['trackedSourceDigest'])

    def test_wrong_source_native_toolchain_environment_or_registry_rejects_before_execution(self):
        for key in self.context:
            bad = copy.deepcopy(self.context)
            bad[key] = 'wrong'
            with self.subTest(key=key):
                code, receipt, _ = self.run_program("raise Exception('must not execute')", bad)
                self.assertEqual(code, 1)
                self.assertEqual(receipt['status'], 'rejected')
        (self.source / 'input.txt').write_text('mutated')
        code, receipt, _ = self.run_program("raise Exception('must not execute')")
        self.assertEqual(receipt['status'], 'rejected')

    def test_new_input_mode_and_untracked_file_cannot_silently_reuse_snapshot(self):
        (self.repo / 'input.txt').write_text('changed')
        changed = probe.stage(self.repo, self.root / 'stage2', self.policy)
        self.assertNotEqual(changed['candidateCompileDigest'], self.manifest['candidateCompileDigest'])
        (self.repo / 'input.txt').chmod(0o755)
        mode = probe.stage(self.repo, self.root / 'stage3', self.policy)
        self.assertNotEqual(changed['candidateCompileDigest'], mode['candidateCompileDigest'])
        (self.repo / 'new.rs').write_text('new target')
        with self.assertRaisesRegex(ValueError, 'untracked'):
            probe.stage(self.repo, self.root / 'stage4', self.policy)
        subprocess.run(['git', 'add', '.'], cwd=self.repo, check=True)
        self.policy['includeFiles'].append('new.rs')
        added = probe.stage(self.repo, self.root / 'stage5', self.policy)
        self.assertNotEqual(mode['candidateCompileDigest'], added['candidateCompileDigest'])


if __name__ == '__main__':
    unittest.main()
