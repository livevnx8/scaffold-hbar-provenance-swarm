import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const REGISTRY_ABI = [
  'function getAnchor(string calldata claimId) external view returns (bytes32 decisionHash, uint64 anchoredAt, address anchoredBy)',
  'function verifyReceipt(string calldata claimId, bytes32 decisionHash) external view returns (bool)',
];

export async function POST(req: Request) {
  let body: { claimId?: string; decisionHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { claimId, decisionHash } = body;
  if (!claimId || !decisionHash) {
    return NextResponse.json({ error: 'claimId and decisionHash are required' }, { status: 400 });
  }

  const registryAddress = process.env.HEDERA_REGISTRY_ADDRESS;
  if (!registryAddress) {
    return NextResponse.json(
      {
        error:
          'No registry contract configured. Deploy one with: npm run deploy:testnet --workspace=@provenance-swarm/contracts',
      },
      { status: 400 },
    );
  }

  try {
    const rpcUrl = process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
    const clean = decisionHash.startsWith('0x') ? decisionHash : '0x' + decisionHash;

    let match: boolean;
    try {
      match = await registry.verifyReceipt(claimId, clean);
    } catch {
      return NextResponse.json({ match: false });
    }
    if (!match) return NextResponse.json({ match: false });

    const [hash, anchoredAt, anchoredBy] = await registry.getAnchor(claimId);
    return NextResponse.json({
      match: true,
      decisionHash: hash as string,
      anchoredAt: new Date(Number(anchoredAt) * 1000).toLocaleString(),
      anchoredBy: anchoredBy as string,
    });
  } catch (err) {
    return NextResponse.json(
      { match: false, error: err instanceof Error ? err.message : 'Lookup failed' },
      { status: 500 },
    );
  }
}