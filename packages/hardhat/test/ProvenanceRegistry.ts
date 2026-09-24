import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProvenanceRegistry", function () {
  const claimId = "claim-cof-042";
  const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("fixture-decision"));

  async function deploy() {
    const Registry = await ethers.getContractFactory("ProvenanceRegistry");
    const registry = await Registry.deploy();
    return { registry };
  }

  it("anchors a receipt and reads it back", async function () {
    const { registry } = await deploy();
    await expect(registry.anchorReceipt(claimId, decisionHash))
      .to.emit(registry, "ReceiptAnchored")
      .withArgs(claimId, decisionHash, await (await ethers.getSigners())[0].getAddress());

    const [hash, anchoredAt, anchoredBy] = await registry.getAnchor(claimId);
    expect(hash).to.equal(decisionHash);
    expect(anchoredAt).to.be.greaterThan(0);
    expect(anchoredBy).to.equal(await (await ethers.getSigners())[0].getAddress());
  });

  it("verifies a presented receipt hash", async function () {
    const { registry } = await deploy();
    await registry.anchorReceipt(claimId, decisionHash);
    expect(await registry.verifyReceipt(claimId, decisionHash)).to.equal(true);
    expect(await registry.verifyReceipt(claimId, ethers.keccak256(ethers.toUtf8Bytes("other")))).to.equal(
      false,
    );
  });

  it("rejects double anchoring the same claim", async function () {
    const { registry } = await deploy();
    await registry.anchorReceipt(claimId, decisionHash);
    await expect(registry.anchorReceipt(claimId, decisionHash)).to.be.revertedWith(
      "already anchored",
    );
  });

  it("reverts lookups for unknown claims", async function () {
    const { registry } = await deploy();
    await expect(registry.getAnchor("nope")).to.be.revertedWith("unknown claim");
  });

  it("rejects empty claim ids and zero hashes", async function () {
    const { registry } = await deploy();
    await expect(registry.anchorReceipt("", decisionHash)).to.be.revertedWith("empty claimId");
    await expect(
      registry.anchorReceipt(claimId, "0x0000000000000000000000000000000000000000000000000000000000000000"),
    ).to.be.revertedWith("empty decisionHash");
  });

  it("sets the deployer as the first operator", async function () {
    const { registry } = await deploy();
    const [deployer] = await ethers.getSigners();
    expect(await registry.operator()).to.equal(await deployer.getAddress());
  });

  it("reverts anchoring from a non-operator (no claimId squatting)", async function () {
    const { registry } = await deploy();
    const [, stranger] = await ethers.getSigners();
    await expect(
      registry.connect(stranger).anchorReceipt(claimId, decisionHash),
    ).to.be.revertedWith("not operator");
    // The claim stays unanchored: no squat happened.
    await expect(registry.getAnchor(claimId)).to.be.revertedWith("unknown claim");
  });

  it("rotates the operator; the old operator loses anchoring rights", async function () {
    const { registry } = await deploy();
    const [deployer, next] = await ethers.getSigners();

    await expect(registry.transferOperator(await next.getAddress()))
      .to.emit(registry, "OperatorTransferred")
      .withArgs(await deployer.getAddress(), await next.getAddress());
    expect(await registry.operator()).to.equal(await next.getAddress());

    await expect(registry.anchorReceipt(claimId, decisionHash)).to.be.revertedWith(
      "not operator",
    );
    await registry.connect(next).anchorReceipt(claimId, decisionHash);
    expect(await registry.verifyReceipt(claimId, decisionHash)).to.equal(true);
  });

  it("reverts operator transfer to the zero address and from non-operators", async function () {
    const { registry } = await deploy();
    const [, stranger] = await ethers.getSigners();
    await expect(
      registry.transferOperator("0x0000000000000000000000000000000000000000"),
    ).to.be.revertedWith("zero operator");
    await expect(
      registry.connect(stranger).transferOperator(await stranger.getAddress()),
    ).to.be.revertedWith("not operator");
  });
});