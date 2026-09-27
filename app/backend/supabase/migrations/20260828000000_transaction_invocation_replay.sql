CREATE TABLE IF NOT EXISTS transaction_invocation_replays (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  response JSONB,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, idempotency_key)
);

CREATE OR REPLACE FUNCTION claim_transaction_invocation(
  p_scope TEXT, p_key TEXT, p_fingerprint TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE existing transaction_invocation_replays;
BEGIN
  INSERT INTO transaction_invocation_replays(scope, idempotency_key, fingerprint, status)
  VALUES (p_scope, p_key, p_fingerprint, 'pending')
  ON CONFLICT (scope, idempotency_key) DO NOTHING;

  SELECT * INTO existing FROM transaction_invocation_replays
  WHERE scope = p_scope AND idempotency_key = p_key FOR UPDATE;

  IF existing.fingerprint <> p_fingerprint THEN
    RETURN jsonb_build_object('kind', 'conflict');
  END IF;
  IF existing.status = 'completed' THEN
    RETURN jsonb_build_object('kind', 'cached', 'response', existing.response);
  END IF;
  IF existing.claimed_at < now() - interval '5 minutes' THEN
    UPDATE transaction_invocation_replays SET claimed_at = now(), updated_at = now()
    WHERE scope = p_scope AND idempotency_key = p_key;
    RETURN jsonb_build_object('kind', 'claimed');
  END IF;
  RETURN jsonb_build_object('kind', 'in_flight');
END;
$$;

CREATE OR REPLACE FUNCTION complete_transaction_invocation(
  p_scope TEXT, p_key TEXT, p_response JSONB
) RETURNS VOID LANGUAGE SQL AS $$
  UPDATE transaction_invocation_replays
  SET status = 'completed', response = p_response, updated_at = now()
  WHERE scope = p_scope AND idempotency_key = p_key AND status = 'pending';
$$;

CREATE OR REPLACE FUNCTION release_transaction_invocation(
  p_scope TEXT, p_key TEXT
) RETURNS VOID LANGUAGE SQL AS $$
  DELETE FROM transaction_invocation_replays
  WHERE scope = p_scope AND idempotency_key = p_key AND status = 'pending';
$$;