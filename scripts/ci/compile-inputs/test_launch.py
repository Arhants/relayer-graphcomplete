import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import subprocess
from unittest.mock import patch
from launch import extract_native, cleanup_container, copy_registry_inputs, main, IMAGE
from probe import stage
from probe import file_digest, inventory


class NativeConsumerTests(unittest.TestCase):
    def test_launcher_rejects_cross_phase_drift_before_dependency_preparation_or_execution(self):
        policy = json.loads(Path(__file__).with_name('policy.json').read_text())
        for changed in (None, 'Cargo.lock', 'excluded.txt'):
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                repository, output = root / 'repo', root / 'output'
                repository.mkdir()
                subprocess.run(['git', 'init', '-q', str(repository)], check=True)
                for name in [*policy['includeFiles'], 'excluded.txt']:
                    path = repository / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text('original')
                subprocess.run(['git', 'add', '.'], cwd=repository, check=True)
                actual_check_output = subprocess.check_output
                def inspect_or_git(command, **kwargs):
                    if command[:3] == ['docker', 'image', 'inspect']:
                        return IMAGE + '\n'
                    return actual_check_output(command, **kwargs)
                def staging(*args):
                    manifest = stage(*args)
                    if args[-1] and changed:
                        (repository / changed).write_text('mutated between phases')
                    return manifest
                argv = ['launch.py', '--repository', str(repository), '--registry', str(root / 'registry'),
                        '--native-export', str(root / 'native'), '--output', str(output),
                        '--deadline-seconds', '60', '--grant', 'deterministic-fixture']
                def mutate_original_lock(*_args):
                    (repository / 'Cargo.lock').write_text('changed after staging')
                def inspect_staged_lock(lock, *_args):
                    self.assertEqual(lock, output.resolve() / 'full/source/Cargo.lock')
                    self.assertEqual(lock.read_text(), 'original')
                    raise ValueError('preparation checkpoint')
                with patch('sys.argv', argv), patch('launch.os.getuid', return_value=1000), \
                        patch('launch.subprocess.check_output', side_effect=inspect_or_git), \
                        patch('launch.stage', side_effect=staging), \
                        patch('launch.copy_registry_inputs', side_effect=mutate_original_lock) as prepare_registry, \
                        patch('launch.prepare', side_effect=inspect_staged_lock) as prepare_locked:
                    self.assertEqual(main(), 1)
                receipt = json.loads((output / 'receipt.json').read_text())
                sources = json.loads((output / 'sources.json').read_text())
                self.assertEqual(receipt['status'], 'stopped')
                self.assertEqual(receipt['phases'], [])
                self.assertFalse((output / 'active-container.txt').exists())
                if changed:
                    prepare_registry.assert_not_called()
                    prepare_locked.assert_not_called()
                    self.assertIn('source changed between phase staging', receipt['error'])
                    self.assertNotEqual(sources['full']['trackedSourceDigest'], sources['projected']['trackedSourceDigest'])
                    if changed == 'excluded.txt':
                        self.assertEqual(sources['full']['candidateCompileDigest'], sources['projected']['candidateCompileDigest'])
                else:
                    prepare_registry.assert_called_once()
                    prepare_locked.assert_called_once()
                    self.assertEqual(receipt['error'], 'preparation checkpoint')
                    self.assertEqual(sources['full']['trackedSourceDigest'], sources['projected']['trackedSourceDigest'])

    def test_registry_copy_declares_tag_and_excludes_prior_extracted_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, destination = root / 'registry', root / 'fresh'
            source.mkdir()
            destination.mkdir()
            for name in ('cache', 'index', 'src'):
                (source / name).mkdir()
                (source / name / 'input').write_text(name)
            (source / 'CACHEDIR.TAG').write_text('explicit Cargo bookkeeping')
            copy_registry_inputs(source, destination)
            self.assertEqual({r['path'] for r in inventory(destination)},
                             {'CACHEDIR.TAG', 'cache/input', 'index/input'})
            (source / 'CACHEDIR.TAG').unlink()
            (source / 'CACHEDIR.TAG').symlink_to('/outside')
            with self.assertRaisesRegex(ValueError, 'nonregular'):
                copy_registry_inputs(source, destination)

    def test_cleanup_still_removes_owned_container_after_stop_and_inspect_timeout(self):
        receipt = {}
        with patch('launch.subprocess.run', side_effect=[
                subprocess.TimeoutExpired('stop', 10), subprocess.TimeoutExpired('inspect', 10),
                subprocess.CompletedProcess([], 0)]) as run:
            cleanup_container('owned-fixture', receipt)
        self.assertEqual(run.call_args_list[-1].args[0], ['docker', 'rm', '--force', 'owned-fixture'])
        self.assertEqual(len(receipt['cleanupErrors']), 2)
        self.assertNotIn('unreleasedContainer', receipt)

    def test_archive_and_exact_native_inventory_must_both_match(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = root / 'original'
            original.mkdir()
            (original / 'library').write_bytes(b'qualified dependency fixture')
            archive = root / 'native.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                tar.add(original, arcname='.')
            receipt = {'archiveSha256': file_digest(archive), 'nativeFiles': inventory(original)}
            extract_native(archive, receipt, root / 'accepted')
            self.assertEqual(inventory(root / 'accepted'), receipt['nativeFiles'])
            changed = json.loads(json.dumps(receipt))
            changed['nativeFiles'][0]['sha256'] = 'wrong'
            with self.assertRaisesRegex(ValueError, 'inventory'):
                extract_native(archive, changed, root / 'wrong-content')
            with tarfile.open(archive, 'w:gz') as tar:
                link = tarfile.TarInfo('./library')
                link.type = tarfile.SYMTYPE
                link.linkname = '/outside'
                tar.addfile(link)
            with self.assertRaisesRegex(ValueError, 'checksum'):
                extract_native(archive, receipt, root / 'wrong-archive')
            receipt['archiveSha256'] = file_digest(archive)
            with self.assertRaisesRegex(ValueError, 'unexpected'):
                extract_native(archive, receipt, root / 'linked')


if __name__ == '__main__':
    unittest.main()
