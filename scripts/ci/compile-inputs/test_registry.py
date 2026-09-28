import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('registry', Path(__file__).with_name('registry.py'))
registry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registry)


class RegistryTests(unittest.TestCase):
    def test_locked_bytes_extract_fresh_and_wrong_or_linked_archives_stop(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cache = root / 'cache/index'
            cache.mkdir(parents=True)
            archive = cache / 'demo-1.crate'
            lock = root / 'Cargo.lock'
            def write(link=False):
                with tarfile.open(archive, 'w:gz') as tar:
                    member = tarfile.TarInfo('demo-1/input.rs')
                    member.size = 4
                    if link:
                        member.type = tarfile.SYMTYPE
                        member.linkname = '/outside'
                        member.size = 0
                    tar.addfile(member, io.BytesIO(b'code'))
                checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
                lock.write_text('[[package]]\nname="demo"\nversion="1"\nsource="registry+https://github.com/rust-lang/crates.io-index"\nchecksum="'+checksum+'"\n')
            write()
            report = registry.prepare(lock, cache.parent, root / 'fresh')
            self.assertEqual((root / 'fresh/index/demo-1/input.rs').read_bytes(), b'code')
            self.assertIsNone(report['completeDigest'])
            archive.write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                registry.prepare(lock, cache.parent, root / 'bad')
            write(True)
            with self.assertRaisesRegex(ValueError, 'nonregular'):
                registry.prepare(lock, cache.parent, root / 'linked')


if __name__ == '__main__':
    unittest.main()
