"""Candidate opportunity audit. A successful job is not a published cache entry."""
from datetime import datetime


def before(left, right):
    try:
        first, second = [datetime.fromisoformat(value.replace('Z', '+00:00')) for value in (left, right)]
        if first.tzinfo is None or second.tzinfo is None:
            return None
        return first < second
    except (ValueError, TypeError, AttributeError):
        return None


def visible(writer, consumer):
    # Supplied refs must come from retained historical event/checkout evidence.
    # No branch-name-only approximation for PR merge refs or unknown base refs.
    refs = consumer.get('accessibleRefs')
    return refs is not None and writer.get('cacheRef') in refs


def audit(rows):
    output = []
    for consumer in rows:
        record = {'id': consumer['id'], 'attempt': consumer.get('attempt'), 'candidateWriters': [],
                  'completeWriters': [], 'observedCacheHits': [], 'unknowns': list(consumer.get('unknowns', []))}
        ready = all(consumer.get(key) for key in ('checkoutVerified', 'treeComplete', 'contractApplicable', 'candidateDigest', 'jobStartedAt'))
        if not ready:
            record['unknowns'].append('checkout/tree/contract/input evidence unavailable')
        if consumer.get('accessibleRefs') is None:
            record['unknowns'].append('historical cache visibility unavailable')
        if consumer.get('completeDigest') is not None:
            raise ValueError('this diagnostic has no qualified complete input contract')
        if ready and consumer.get('jobConclusion') == 'success':
            for writer in rows:
                if ((writer['id'], writer.get('attempt')) == (consumer['id'], consumer.get('attempt')) or writer.get('jobConclusion') != 'success' or not writer.get('writerEligible')
                        or not all(writer.get(k) for k in ('checkoutVerified', 'treeComplete', 'contractApplicable', 'jobCompletedAt'))
                        or writer.get('candidateDigest') != consumer['candidateDigest']
                        or not visible(writer, consumer)):
                    continue
                timing = before(writer['jobCompletedAt'], consumer['jobStartedAt'])
                if timing is None:
                    record['unknowns'].append(f"invalid job timestamp for writer {writer['id']} or consumer")
                if timing is not True:
                    continue
                record['candidateWriters'].append({'id': writer['id'], 'attempt': writer.get('attempt'),
                                                   'kind': 'hypothetical successful writer; publication/retention unobserved'})
        record['unknowns'].append('complete build identity, cache publication/version/retention and hits unqualified')
        output.append(record)
    return {'rows': output, 'selectedJobs': len(rows),
            'successfulConsumers': sum(r.get('jobConclusion') == 'success' for r in rows),
            'contractApplicableConsumers': sum(bool(r.get('contractApplicable')) for r in rows),
            'candidateCompatibleConsumers': sum(bool(r['candidateWriters']) for r in output),
            'completeCompatibleConsumers': 0, 'observedHits': None,
            'authority': 'candidate opportunity only; never cache hits or test evidence'}
