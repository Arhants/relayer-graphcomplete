-- PROV-006: the app server's row became the only readiness record. A row that is ready
-- before this migration may not come from a readiness evaluation (older builds trusted
-- the JSON catalog), so every route is verified again once. Startup restores ready only
-- from a ready row, so until the next evaluation each route stays pending.
UPDATE product_harnesses
SET available = 0,
    unavailable_reason_code = 'harness_readiness_pending',
    unavailable_reason_message = 'This execution configuration is currently unavailable.'
WHERE available = 1;
