-- Seed is intentionally idempotent. Runtime users and courses are created by their owning modules.
INSERT INTO xp_ledger (event_id, user_id, event_type, points, metadata)
VALUES ('seed:backend-academy:welcome', 'seed-user', 'contribution.created', 25, '{"source":"seed"}'::jsonb)
ON CONFLICT (event_id) DO NOTHING;
