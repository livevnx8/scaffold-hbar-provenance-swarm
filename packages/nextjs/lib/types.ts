export type {
  ProvenanceClaim,
  ProvenanceReceipt,
  WorkerVerdict,
  DoubleVerifierReport,
  CustodyLink,
  ProvenanceDocument,
  OriginAttestation,
} from '@provenance-swarm/swarm';

export interface ChainConfig {
  hedera: boolean;
  topic: boolean;
  certificateToken: boolean;
  registry: boolean;
  network: 'testnet' | 'mainnet';
}

export interface AnchorResults {
  hcs: {
    ok: boolean;
    topicId?: string;
    sequenceNumber?: string;
    transactionId?: string;
    mirrorUrl?: string;
    network?: string;
    error?: string;
  };
  contract: { ok: boolean; address?: string; transactionId?: string; skipped?: string; error?: string };
  nft: { ok: boolean; tokenId?: string; serial?: string; transactionId?: string; skipped?: string; error?: string };
}

export function hashscanTx(network: string, txId: string): string {
  return `https://hashscan.io/${network}/transaction/${txId}`;
}

export function hashscanTopic(network: string, topicId: string): string {
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

export function hashscanToken(network: string, tokenId: string): string {
  return `https://hashscan.io/${network}/token/${tokenId}`;
}

export function hashscanContract(network: string, address: string): string {
  return `https://hashscan.io/${network}/contract/${address}`;
}