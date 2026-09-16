// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ProvenanceRegistry — on-chain anchor for provenance-swarm receipts.
 *
 * A claim's off-chain verification produces a tamper-evident receipt
 * (taskHash / decisionHash). This registry stores the decisionHash per claimId
 * so any third party can confirm that a receipt presented to them matches what
 * was anchored on Hedera, without trusting the party that ran the swarm.
 */
contract ProvenanceRegistry {
    struct Anchor {
        bytes32 decisionHash;
        uint64 anchoredAt;
        address anchoredBy;
    }

    mapping(string => Anchor) private _anchors;

    event ReceiptAnchored(
        string indexed claimId,
        bytes32 indexed decisionHash,
        address indexed anchoredBy
    );

    /// Anchor a receipt's decision hash for a claim. One anchor per claim id.
    function anchorReceipt(string calldata claimId, bytes32 decisionHash) external {
        require(bytes(claimId).length > 0, "empty claimId");
        require(decisionHash != bytes32(0), "empty decisionHash");
        require(_anchors[claimId].anchoredAt == 0, "already anchored");
        _anchors[claimId] = Anchor(decisionHash, uint64(block.timestamp), msg.sender);
        emit ReceiptAnchored(claimId, decisionHash, msg.sender);
    }

    /// Look up the anchor for a claim. Reverts for unknown claims.
    function getAnchor(
        string calldata claimId
    ) external view returns (bytes32 decisionHash, uint64 anchoredAt, address anchoredBy) {
        Anchor memory a = _anchors[claimId];
        require(a.anchoredAt != 0, "unknown claim");
        return (a.decisionHash, a.anchoredAt, a.anchoredBy);
    }

    /// Convenience check: does the presented hash match the anchored one?
    function verifyReceipt(string calldata claimId, bytes32 decisionHash) external view returns (bool) {
        return _anchors[claimId].decisionHash == decisionHash && _anchors[claimId].anchoredAt != 0;
    }
}
