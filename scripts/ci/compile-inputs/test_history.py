import importlib.util
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import history


class HistoryTests(unittest.TestCase):
    def test_actual_guard_bytes_include_workspace_manifests_and_staged_additions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            manifest = root / 'crates/demo/Cargo.toml'
            manifest.parent.mkdir(parents=True)
            manifest.write_text('original')
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            first = history.current_guards(root)
            self.assertEqual(first[0][0], 'crates/demo/Cargo.toml')
            manifest.write_text('changed build recipe')
            self.assertNotEqual(first, history.current_guards(root))
            (root / 'untracked').write_text('unknown')
            with self.assertRaisesRegex(ValueError, 'untracked'):
                history.current_guards(root)

    def test_actual_checkout_overrides_workflow_head_and_truncated_tree_stays_unknown(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sha, tree = 'a'*40, 'b'*40
            rows = {'runs.json': [{'id':1,'event':'push','head_branch':'main','head_sha':'c'*40,
                                  'repository':{'id':1},'head_repository':{'id':1}}],
                    'selection.json':[{'id':1,'attempt':1}],
                    '1-jobs.json':{'total_count':1,'jobs':[{'name':'Fresh Rust tests','run_attempt':1,
                         'conclusion':'success','started_at':'2026-09-28T01:00:00Z','completed_at':'2026-09-28T01:01:00Z'}]},
                    sha+'-commit.json':{'sha':sha,'tree':{'sha':tree}},
                    tree+'-tree.json':{'sha':tree,'truncated':False,'tree':[{'path':'input.rs','type':'blob','mode':'100644','sha':'d'*40}]}}
            for name,value in rows.items():(root/name).write_text(json.dumps(value))
            (root/'1-rust.log').write_text('T git log -1 --format=%H\nT '+sha+'\n')
            policy={'includeFiles':['input.rs'],'includeRoots':[]}
            with patch.object(history,'current_guards',return_value=[]):
                result=history.load_history(root,root,policy)
                self.assertEqual(result['normalized'][0]['sourceCommit'],sha)
                self.assertTrue(result['normalized'][0]['checkoutVerified'])
                self.assertIsNone(result['normalized'][0]['completeDigest'])
                rows[tree+'-tree.json']['truncated']=True
                (root/(tree+'-tree.json')).write_text(json.dumps(rows[tree+'-tree.json']))
                rejected=history.load_history(root,root,policy)
                self.assertFalse(rejected['normalized'][0]['treeComplete'])
                self.assertTrue(rejected['normalized'][0]['unknowns'])


if __name__=='__main__':unittest.main()
