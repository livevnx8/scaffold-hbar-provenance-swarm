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

/** Frozen Window 9 exhibit topic — template live paths must never write here. */
export const FROZEN_EXHIBIT_TOPIC_ID = '0.0.10569989';

export interface HederaAnchorConfig {
  operatorId: string;
  operatorKey: string;
  network: 'testnet' | 'mainnet';
  topicId?: string;
  certificateTokenId?: string;
  /**
   * Curve of the operator key. Raw 32-byte keys cannot be distinguished by
   * inspection, and the SDK defaults to ED25519 — set 'ecdsa' for
   * ECDSA/secp256k1 operator keys (e.g. HashPack-style accounts).
   */
  keyType?: 'ed25519' | 'ecdsa';
}

/** Parse the operator key honoring the configured curve. */
export function parseOperatorKey(key: string, keyType?: 'ed25519' | 'ecdsa'): PrivateKey {
  if (keyType === 'ecdsa') return PrivateKey.fromStringECDSA(key.replace(/^0x/, ''));
  if (keyType === 'ed25519') return PrivateKey.fromStringED25519(key.replace(/^0x/, ''));
  return PrivateKey.fromString(key);
}

/** Read config from the environment; returns null when no operator is set. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): HederaAnchorConfig | null {
  const operatorId = env.HEDERA_OPERATOR_ID;
  const operatorKey = env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) return null;
  const keyType = env.HEDERA_KEY_TYPE === 'ecdsa' ? 'ecdsa'
    : env.HEDERA_KEY_TYPE === 'ed25519' ? 'ed25519' : undefined;
  return {
    operatorId,
    operatorKey,
    network: env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
    topicId:
      env.HEDERA_TEMPLATE_TOPIC_ID?.trim() ||
      env.HEDERA_PROVENANCE_TOPIC_ID?.trim() ||
      undefined,
    certificateTokenId: env.HEDERA_CERTIFICATE_TOKEN_ID?.trim() || undefined,
    keyType,
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
    this.client.setOperator(config.operatorId, parseOperatorKey(config.operatorKey, config.keyType));
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
    if (this.config.topicId) {
      if (this.config.topicId === FROZEN_EXHIBIT_TOPIC_ID) {
        throw new Error(
          `Refusing to write to frozen Window 9 exhibit topic ${FROZEN_EXHIBIT_TOPIC_ID}. ` +
            'Set HEDERA_TEMPLATE_TOPIC_ID to a separate live topic (or leave it empty to auto-create one).',
        );
      }
      return this.config.topicId;
    }
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
    if (topicId === FROZEN_EXHIBIT_TOPIC_ID) {
      throw new Error(
        `Refusing to write to frozen Window 9 exhibit topic ${FROZEN_EXHIBIT_TOPIC_ID}.`,
      );
    }
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
    const operatorKey = parseOperatorKey(this.config.operatorKey, this.config.keyType);
    const tx = await new TokenCreateTransaction()
      .setTokenName(name)
      .setTokenSymbol(symbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0)
      .setInitialSupply(0)
      .setTreasuryAccountId(this.config.operatorId)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(100000)
      .setSupplyKey(operatorKey.publicKey)
      .freezeWith(this.client);
    const signed = await tx.sign(operatorKey);
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
   * defaults to the compact `<claimId>/<decisionHash>` pointer (HTS NFT metadata
   * is capped at 100 bytes — the full claim/decision/verdict JSON exceeds it).
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
    let metadata = opts?.metadata;
    if (!metadata) {
      const compact = `${receipt.claimId}/${receipt.decisionHash}`;
      if (Buffer.byteLength(compact, 'utf8') > 100) {
        // Prefer decision hash alone when claimId is long; always ≤ 64 bytes.
        metadata = Buffer.from(receipt.decisionHash, 'utf8');
      } else {
        metadata = Buffer.from(compact, 'utf8');
      }
    }
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
