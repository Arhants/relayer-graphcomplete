import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def row(self, identity, ref):
        return {'id': identity, 'attempt': 1, 'cacheRef': ref, 'accessibleRefs': [ref, 'refs/heads/main'],
                'writerEligible': True, 'checkoutVerified': True, 'treeComplete': True, 'contractApplicable': True,
                'candidateDigest': 'candidate', 'completeDigest': None, 'jobConclusion': 'success',
                'jobStartedAt': '2026-09-28T01:00:00Z', 'jobCompletedAt': '2026-09-28T01:05:00Z'}

    def test_actual_job_start_visibility_and_success_define_hypothetical_candidates(self):
        main = self.row(1, 'refs/heads/main')
        pr = self.row(2, 'refs/pull/2/merge')
        pr['jobStartedAt'] = '2026-09-28T01:06:00Z'
        result = audit.audit([main, pr])
        self.assertEqual(result['candidateCompatibleConsumers'], 1)
        self.assertEqual(result['completeCompatibleConsumers'], 0)
        self.assertIsNone(result['observedHits'])
        for patch in ({'jobConclusion': 'cancelled'}, {'jobCompletedAt': '2026-09-28T01:07:00Z'},
                      {'cacheRef': 'refs/pull/3/merge'}, {'contractApplicable': False}, {'jobCompletedAt': 'malformed'}):
            changed = dict(main, **patch)
            self.assertEqual(audit.audit([changed, pr])['candidateCompatibleConsumers'], 0)

    def test_unknown_checkout_tree_guard_or_context_never_becomes_complete(self):
        writer, consumer = self.row(1, 'refs/pull/1/merge'), self.row(2, 'refs/heads/main')
        consumer['jobStartedAt'] = '2026-09-28T01:06:00Z'
        self.assertEqual(audit.audit([writer, consumer])['candidateCompatibleConsumers'], 0)
        for key in ('checkoutVerified', 'treeComplete', 'contractApplicable'):
            changed = copy.deepcopy(consumer)
            changed[key] = False
            self.assertTrue(audit.audit([changed])['rows'][0]['unknowns'])
        consumer['completeDigest'] = 'not-certified'
        with self.assertRaises(ValueError):
            audit.audit([consumer])


if __name__ == '__main__':
    unittest.main()
