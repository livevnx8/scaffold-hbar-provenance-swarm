/**
 * Live testnet read: real Chainlink round -> attestation -> value worker.
 * Read-only. No keys, no spend. Usage: npm run check:live --workspace @provenance-swarm/oracle
 */
import { fixtureValueClaim, FIXTURE_VALUE_USD_CENTS } from '@provenance-swarm/swarm';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';
import { HashioPriceFeed } from '../src/reader.js';
import { attestClaimValue } from '../src/attestation.js';
import { ValueAttestationWorker } from '../src/worker.js';
import { CHAINLINK_FEEDS_TESTNET } from '../src/feeds.js';

const spec = CHAINLINK_FEEDS_TESTNET.HBAR;
const feed = new HashioPriceFeed(spec.address, spec.pair);
const round = await feed.getLatestRound();
const nowSec = Math.floor(Date.now() / 1000);
const ageSec = nowSec - round.updatedAt;

console.log('feed       ', round.feedAddress);
console.log('roundId    ', round.roundId);
console.log('answer     ', round.answer, `(~$${(Number(round.answer) / 1e8).toFixed(5)})`);
console.log('updatedAt  ', round.updatedAt, `(age ${ageSec}s)`);
console.log('decimals   ', round.decimals);
console.log('mode       ', round.mode);

// Attest the valid fixture against the live round (the real /api/verify path).
const valid = await attestClaimValue(fixtureValueClaim());
const inflated: ProvenanceClaim = {
  ...fixtureValueClaim(),
  claimId: 'claim-cof-042-value-100x',
  declaredValue: {
    ...fixtureValueClaim().declaredValue!,
    usdEquivalent: (BigInt(FIXTURE_VALUE_USD_CENTS) * 100n).toString(),
  },
};
const inflatedAttested = await attestClaimValue(inflated);

const worker = new ValueAttestationWorker();
for (const [label, claim] of [
  ['valid fixture', valid],
  ['100x declared value', inflatedAttested],
] as const) {
  const res = worker.verify(claim);
  console.log(`--- ${label}: passed=${res.passed}`);
  for (const f of res.findings) console.log(`    finding: ${f}`);
}
