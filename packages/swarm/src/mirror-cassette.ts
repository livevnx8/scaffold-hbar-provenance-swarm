/**
 * Provenance Swarm Template — recorded mirror-node responses (cassette)
 *
 * Two real Hedera testnet mirror responses for topic 0.0.10681528, recorded
 * 2026-10-02 from
 *   https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10681528/messages/{3,7}
 * and pinned here so the demo and unit tests exercise the payer/topic trust
 * check offline and deterministically, the same way CHAINLINK_CASSETTE_READING
 * pins a recorded Chainlink round. Fields not read by the verifier
 * (chunk_info, running_hash_version) are dropped.
 *
 * Both messages carry a well-formed v1.1 receipt payload with a valid
 * decisionHash. Seq 7 was paid for by 0.0.9034044; seq 3 by 0.0.10685865.
 * With the operator pinned to 0.0.9034044, seq 7 must match and seq 3 must be
 * refused even though its own decisionHash matches: the null-submit-key topic
 * accepts messages from any payer.
 */

import type { MirrorTrust } from './mirror.js';

export interface MirrorCassetteMessage {
  consensus_timestamp: string;
  message: string;
  payer_account_id: string;
  running_hash: string;
  sequence_number: number;
  topic_id: string;
}

/** Operator and topic the recorded run is judged against (stand-in for server config). */
export const MIRROR_CASSETTE_TRUST: MirrorTrust = {
  operatorAccountId: '0.0.9034044',
  topicId: '0.0.10681528',
};

/** Seq 7: paid for by the operator 0.0.9034044. */
export const MIRROR_CASSETTE_OPERATOR_MESSAGE: MirrorCassetteMessage = {
  consensus_timestamp: '1790201052.444063807',
  message:
    'eyJjbGFpbUlkIjoiY2xhaW0tZGV2aW4tcDEtcGxhaW4tMjAyNjA5MjMiLCJ2ZXJzaW9uIjoiMS4xIiwidGFza0hhc2giOiI4OWExNTM3ZGQ0MGY5NDRkMWNmZTAyZjMxN2ZjNTI2MGZmNjE3ZGE5YTAzYzlmNjBjMjg0YjNhYmE0ZWIyNGNlIiwiZGVjaXNpb25IYXNoIjoiOGU0MmU2MzJmNDA5MzVlODU5OTA3ZGFkOWI4NDY0YjBhNDI1MDlmNWY3MGUwZmYzNDcwOGZkMTI1NThlNjA2YyIsInZlcmRpY3QiOiJ2ZXJpZmllZCIsInRpbWVzdGFtcCI6MTc5MDIwMTA0Mzg2NX0=',
  payer_account_id: '0.0.9034044',
  running_hash: 'beOMlENyIZb83IcSFEHm0Sco9FqBO9k88NEJQLP+7v6W3wmj9YNlQLDcuGPxJ3zu',
  sequence_number: 7,
  topic_id: '0.0.10681528',
};
export const MIRROR_CASSETTE_OPERATOR_DECISION_HASH =
  '8e42e632f40935e859907dad9b8464b0a42509f5f70e0ff34708fd12558e606c';

/** Seq 3: same topic, paid for by a different account (0.0.10685865). */
export const MIRROR_CASSETTE_FOREIGN_PAYER_MESSAGE: MirrorCassetteMessage = {
  consensus_timestamp: '1790189769.937835104',
  message:
    'eyJjbGFpbUlkIjoiY2xhaW0tZTJlLXAxLXBsYWluLTIwMjYwOTIzIiwidmVyc2lvbiI6IjEuMSIsInRhc2tIYXNoIjoiYmYwNmE0N2I3NTZiNzNkY2IxZmZiYTAzZDkwNjFlMDA4NGRmZTEzNDBjODdkZTA0YjVmMTVjNzc4Y2M0MGY2YyIsImRlY2lzaW9uSGFzaCI6IjFhM2U0YjUyYjFiMmY0ZTRiNzQ4NjFhZmYyN2E2ZWI0M2Y5YTIyNDM3ZjFlODBhMmJhZjFkZDlhMWUzYWEyNjMiLCJ2ZXJkaWN0IjoidmVyaWZpZWQiLCJ0aW1lc3RhbXAiOjE3OTAxODk3NDUwMjR9',
  payer_account_id: '0.0.10685865',
  running_hash: 'O+yIhAwamvvMtqX4SzScRnpiBcGTQ3jq9Jb+92miXfKR8gA5nzczFelmz56lN4YI',
  sequence_number: 3,
  topic_id: '0.0.10681528',
};
export const MIRROR_CASSETTE_FOREIGN_PAYER_DECISION_HASH =
  '1a3e4b52b1b2f4e4b74861aff27a6eb43f9a22437f1e80a2baf1dd9a1e3aa263';

/**
 * A fetch stand-in that serves the cassette by sequence number and records the
 * URLs it was asked for. Unknown sequences return 404. No network.
 */
export function mirrorCassetteFetch(
  messages: MirrorCassetteMessage[] = [
    MIRROR_CASSETTE_OPERATOR_MESSAGE,
    MIRROR_CASSETTE_FOREIGN_PAYER_MESSAGE,
  ],
  requested: string[] = [],
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requested.push(url);
    const m = /\/api\/v1\/topics\/([^/]+)\/messages\/(\d+)$/.exec(url);
    const hit = m && messages.find(x => x.topic_id === m[1] && String(x.sequence_number) === m[2]);
    return {
      status: hit ? 200 : 404,
      ok: Boolean(hit),
      json: async () => (hit ? { ...hit } : { _status: { messages: [{ message: 'Not found' }] } }),
    } as Response;
  }) as typeof fetch;
}
