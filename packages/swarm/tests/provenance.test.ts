/**
 * Provenance Swarm Template — Tests
 */

import {
  ProvenanceClient,
  ProvenanceSwarmCoordinator,
  ProvenanceReceiptBuilder,
  HieroDoubleVerifier,
  verifyProvenanceReceipt,
  AgentRegistry,
  OriginAttestationWorker,
  CustodyChainWorker,
  DocumentHashWorker,
  sha256,
  verdictFor,
  ProvenanceClaim,
} from '../src/index.js';

/** A fully valid fixture claim with correctly computed hashes. */
function validClaim(): ProvenanceClaim {
  const farm = 'Finca Santa Rosa';
  const region = 'Huila, Colombia';
  const harvestDate = '2026-03-15';
  const statement = 'Lot COF-042: 60kg washed-process arabica, certified organic.';
  return {
    claimId: 'claim-cof-042',
    product: 'Washed Arabica Coffee',
    lot: 'COF-042',
    origin: {
      farm,
      region,
      harvestDate,
      statement,
      attestationHash: sha256(`${farm}|${region}|${harvestDate}|${statement}`),
    },
    custody: [
      {
        holder: 'Cooperativa Andina',
        receivedAt: '2026-03-20T09:00:00Z',
        handoffHash: sha256(`${farm}|Cooperativa Andina|2026-03-20T09:00:00Z`),
      },
      {
        holder: 'Pacific Roasters',
        receivedAt: '2026-04-02T14:30:00Z',
        handoffHash: sha256('Cooperativa Andina|Pacific Roasters|2026-04-02T14:30:00Z'),
      },
    ],
    documents: [
      { name: 'phytosanitary-certificate.pdf', sha256: 'a'.repeat(64) },
      { name: 'organic-cert.pdf', sha256: 'b'.repeat(64) },
    ],
  };
}

/** A claim where every worker fails: bad attestation, empty chain, no docs. */
function brokenClaim(): ProvenanceClaim {
  const claim = validClaim();
  return {
    ...claim,
    claimId: 'claim-broken',
    origin: { ...claim.origin, attestationHash: '0'.repeat(64) },
    custody: [],
    documents: [],
  };
}

describe('OriginAttestationWorker', () => {
  it('is deterministic for the same claim', () => {
    const worker = new OriginAttestationWorker();
    const claim = validClaim();
    expect(worker.verify(claim)).toEqual(worker.verify(claim));
  });

  it('passes on a valid attestation', () => {
    const result = new OriginAttestationWorker().verify(validClaim());
    expect(result.passed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.findings.join(' ')).toContain('attestation hash recomputes');
  });

  it('fails when the attestation hash is tampered', () => {
    const claim = validClaim();
    claim.origin.attestationHash = 'f'.repeat(64);
    const result = new OriginAttestationWorker().verify(claim);
    expect(result.passed).toBe(false);
    expect(result.findings.join(' ')).toContain('mismatch');
  });

  it('fails cleanly when origin is missing (no crash)', () => {
    const claim = { ...validClaim(), origin: undefined as unknown as ProvenanceClaim['origin'] };
    const result = new OriginAttestationWorker().verify(claim);
    expect(result.passed).toBe(false);
    expect(result.findings.join(' ')).toContain('origin attestation is missing');
  });

  it('rejects impossible calendar dates like 2026-99-99', () => {
    const claim = validClaim();
    claim.origin.harvestDate = '2026-99-99';
    claim.origin.attestationHash = sha256(
      `${claim.origin.farm}|${claim.origin.region}|${claim.origin.harvestDate}|${claim.origin.statement}`,
    );
    const result = new OriginAttestationWorker().verify(claim);
    expect(result.passed).toBe(false);
    expect(result.findings.join(' ')).toContain('calendar date');
  });
});

describe('CustodyChainWorker', () => {
  it('passes on an intact chain', () => {
    const result = new CustodyChainWorker().verify(validClaim());
    expect(result.passed).toBe(true);
    expect(result.findings.join(' ')).toContain('2 handoff(s)');
  });

  it('fails when a handoff hash is tampered', () => {
    const claim = validClaim();
    claim.custody[1].handoffHash = 'f'.repeat(64);
    const result = new CustodyChainWorker().verify(claim);
    expect(result.passed).toBe(false);
    expect(result.findings.join(' ')).toContain('handoff hash mismatch');
  });

  it('fails when timestamps move backwards', () => {
    const claim = validClaim();
    claim.custody[1].receivedAt = '2026-01-01T00:00:00Z';
    const result = new CustodyChainWorker().verify(claim);
    expect(result.passed).toBe(false);
    expect(result.findings.join(' ')).toContain('backwards in time');
  });
});

describe('DocumentHashWorker', () => {
  it('passes on well-formed document hashes', () => {
    const result = new DocumentHashWorker().verify(validClaim());
    expect(result.passed).toBe(true);
  });

  it('fails on a malformed sha256', () => {
    const claim = validClaim();
    claim.documents[0].sha256 = 'not-a-hash';
    const result = new DocumentHashWorker().verify(claim);
    expect(result.passed).toBe(false);
    expect(result.findings.join(' ')).toContain('64-char hex');
  });
});

describe('ProvenanceSwarmCoordinator', () => {
  it('runs all three workers and verifies a valid claim', () => {
    const receipt = new ProvenanceSwarmCoordinator().run(validClaim());
    expect(receipt.results).toHaveLength(3);
    expect(receipt.results.every(r => r.passed)).toBe(true);
    expect(receipt.verdict).toBe('verified');
    expect(receipt.claimId).toBe('claim-cof-042');
  });

  it('rejects a claim where every worker fails', () => {
    const receipt = new ProvenanceSwarmCoordinator().run(brokenClaim());
    expect(receipt.verdict).toBe('rejected');
  });
});

describe('ProvenanceReceiptBuilder', () => {
  it('produces stable hashes for identical inputs', () => {
    const builder = new ProvenanceReceiptBuilder();
    const claim = validClaim();
    const coordinator = new ProvenanceSwarmCoordinator();
    const r1 = builder.build(claim, coordinator.run(claim).results);
    const r2 = builder.build(claim, coordinator.run(claim).results);
    expect(r1.taskHash).toBe(r2.taskHash);
    expect(r1.decisionHash).toBe(r2.decisionHash);
    expect(r1.taskHash).toHaveLength(64);
  });

  it('marks partial failures as needs_review', () => {
    const claim = validClaim();
    claim.documents = [];
    const receipt = new ProvenanceSwarmCoordinator().run(claim);
    expect(verdictFor(receipt.results)).toBe('needs_review');
    expect(receipt.verdict).toBe('needs_review');
  });
});

describe('verifyProvenanceReceipt', () => {
  it('accepts a valid receipt for its claim', () => {
    const claim = validClaim();
    const receipt = new ProvenanceSwarmCoordinator().run(claim);
    const result = verifyProvenanceReceipt(receipt, claim);
    expect(result.ok).toBe(true);
    expect(result.checks.map(c => [c.name, c.ok])).toEqual([
      ['task_hash', true],
      ['decision_hash', true],
      ['verdict_consistency', true],
      ['worker_quorum', true],
    ]);
  });

  it('rejects a tampered decision hash', () => {
    const claim = validClaim();
    const receipt = new ProvenanceSwarmCoordinator().run(claim);
    const result = verifyProvenanceReceipt({ ...receipt, decisionHash: '0'.repeat(64) }, claim);
    expect(result.ok).toBe(false);
    expect(result.checks.find(c => c.name === 'decision_hash')).toMatchObject({ ok: false });
  });

  it('rejects a tampered claim', () => {
    const claim = validClaim();
    const receipt = new ProvenanceSwarmCoordinator().run(claim);
    const tampered = { ...claim, product: 'Counterfeit Beans' };
    const result = verifyProvenanceReceipt(receipt, tampered);
    expect(result.ok).toBe(false);
    expect(result.checks.find(c => c.name === 'task_hash')).toMatchObject({ ok: false });
  });
});

describe('HieroDoubleVerifier', () => {
  it('accepts a valid receipt with an agent-style report', () => {
    const claim = validClaim();
    const receipt = new ProvenanceSwarmCoordinator().run(claim);
    const report = new HieroDoubleVerifier().verify(receipt, claim);
    expect(report.agentId).toBe('hiero-double-verifier');
    expect(report.verdict).toBe('accepted');
    expect(report.summary).toContain('4/4 checks passed');
    expect(report.summary).toContain('pass A hash-integrity: ok');
    expect(report.summary).toContain('pass B policy: ok');
  });

  it('rejects a tampered receipt', () => {
    const claim = validClaim();
    const receipt = new ProvenanceSwarmCoordinator().run(claim);
    const report = new HieroDoubleVerifier().verify(
      { ...receipt, decisionHash: '0'.repeat(64) },
      claim,
    );
    expect(report.verdict).toBe('rejected');
    expect(report.summary).toContain('pass A hash-integrity: FAILED');
  });
});

describe('AgentRegistry', () => {
  it('ships with the three default workers', () => {
    const registry = AgentRegistry.withDefaults();
    expect(registry.list().map(r => r.id).sort()).toEqual([
      'custody-chain',
      'document-hash',
      'origin-attestation',
    ]);
  });

  it('rejects duplicate registration and supports deregistration', () => {
    const registry = AgentRegistry.withDefaults();
    expect(() => registry.register(new OriginAttestationWorker())).toThrow(/already registered/);
    expect(registry.deregister('document-hash')).toBe(true);
    expect(registry.get('document-hash')).toBeUndefined();
    expect(registry.workers()).toHaveLength(2);
  });
});

describe('ProvenanceClient', () => {
  it('verifies a claim end-to-end with no credentials', () => {
    const { receipt, report } = new ProvenanceClient().verifyClaim(validClaim());
    expect(receipt.verdict).toBe('verified');
    expect(report.verdict).toBe('accepted');
  });
});
