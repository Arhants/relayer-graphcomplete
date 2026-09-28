import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import subprocess
from unittest.mock import patch
from launch import extract_native, cleanup_container, copy_registry_inputs
from probe import file_digest, inventory


class NativeConsumerTests(unittest.TestCase):
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
