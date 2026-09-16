/**
 * Provenance Swarm Template — Hedera anchoring
 *
 * Bridges the deterministic receipt pipeline to Hedera:
 *   - HCS: anchors each receipt hash as a topic message (public, timestamped proof)
 *   - HTS: mints a provenance-certificate NFT for accepted claims
 *
 * The verifier core never imports this module. All network I/O is gated
 * behind explicit env config — without HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY
 * every method throws a clear error instead of failing obscurely.
 */

import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenType,
  TokenSupplyType,
} from '@hashgraph/sdk';
import { ProvenanceReceipt } from './types.js';

export interface HederaAnchorConfig {
  operatorId: string;
  operatorKey: string;
  network: 'testnet' | 'mainnet';
  topicId?: string;
  certificateTokenId?: string;
}

/** Read config from the environment; returns null when no operator is set. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): HederaAnchorConfig | null {
  const operatorId = env.HEDERA_OPERATOR_ID;
  const operatorKey = env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) return null;
  return {
    operatorId,
    operatorKey,
    network: env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
    topicId: env.HEDERA_PROVENANCE_TOPIC_ID,
    certificateTokenId: env.HEDERA_CERTIFICATE_TOKEN_ID,
  };
}

export interface AnchorRecord {
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
}

export interface MintRecord {
  tokenId: string;
  serial: string;
  transactionId: string;
}

export class HederaAnchor {
  private client: Client;

  constructor(private config: HederaAnchorConfig) {
    this.client =
      config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.client.setOperator(config.operatorId, PrivateKey.fromString(config.operatorKey));
  }

  /** Build from env; returns null when no operator credentials are configured. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): HederaAnchor | null {
    const config = configFromEnv(env);
    return config ? new HederaAnchor(config) : null;
  }

  get configured(): boolean {
    return true;
  }

  /** Create the provenance topic (or reuse HEDERA_PROVENANCE_TOPIC_ID when set). */
  async ensureTopic(): Promise<string> {
    if (this.config.topicId) return this.config.topicId;
    const tx = await new TopicCreateTransaction()
      .setTopicMemo('Provenance Swarm receipt anchors')
      .execute(this.client);
    const receipt = await tx.getReceipt(this.client);
    const topicId = receipt.topicId?.toString();
    if (!topicId) throw new Error('Topic creation returned no topic id');
    this.config.topicId = topicId;
    return topicId;
  }

  /** Anchor a receipt hash on HCS. Returns the topic, sequence number, and tx id. */
  async anchorReceipt(receipt: ProvenanceReceipt): Promise<AnchorRecord> {
    const topicId = await this.ensureTopic();
    const message = JSON.stringify({
      claimId: receipt.claimId,
      taskHash: receipt.taskHash,
      decisionHash: receipt.decisionHash,
      verdict: receipt.verdict,
      timestamp: receipt.timestamp,
    });
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(this.client);
    const record = await tx.getRecord(this.client);
    return {
      topicId,
      sequenceNumber: record.receipt.topicSequenceNumber?.toString() ?? '',
      transactionId: tx.transactionId.toString(),
    };
  }

  /** Create the certificate NFT collection (one-time setup per network). */
  async createCertificateToken(
    name = 'Provenance Certificate',
    symbol = 'PROVC',
  ): Promise<string> {
    const tx = await new TokenCreateTransaction()
      .setTokenName(name)
      .setTokenSymbol(symbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0)
      .setInitialSupply(0)
      .setTreasuryAccountId(this.config.operatorId)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(100000)
      .setSupplyKey(PrivateKey.fromString(this.config.operatorKey).publicKey)
      .freezeWith(this.client);
    const signed = await tx.sign(PrivateKey.fromString(this.config.operatorKey));
    const submitted = await signed.execute(this.client);
    const receipt = await submitted.getReceipt(this.client);
    const tokenId = receipt.tokenId?.toString();
    if (!tokenId) throw new Error('Token creation returned no token id');
    this.config.certificateTokenId = tokenId;
    return tokenId;
  }

  /**
   * Mint a provenance-certificate NFT carrying the receipt's decision hash.
   * Pass custom `metadata` bytes (e.g. a HIP-412 JSON document) for art NFTs;
   * defaults to the compact claim/decision/verdict JSON.
   */
  async mintCertificate(
    receipt: ProvenanceReceipt,
    opts?: { metadata?: Buffer },
  ): Promise<MintRecord> {
    const tokenId = this.config.certificateTokenId;
    if (!tokenId) {
      throw new Error(
        'No certificate token configured — run createCertificateToken() once, then set HEDERA_CERTIFICATE_TOKEN_ID',
      );
    }
    const metadata =
      opts?.metadata ??
      Buffer.from(
        JSON.stringify({
          claimId: receipt.claimId,
          decisionHash: receipt.decisionHash,
          verdict: receipt.verdict,
        }),
        'utf8',
      );
    const tx = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .setMetadata([metadata])
      .execute(this.client);
    const record = await tx.getRecord(this.client);
    const serial = record.receipt.serials?.[0]?.toString() ?? '';
    return { tokenId, serial, transactionId: tx.transactionId.toString() };
  }

  close(): void {
    this.client.close();
  }
}
