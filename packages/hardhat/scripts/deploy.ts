import { ethers } from "hardhat";

async function main() {
  const Registry = await ethers.getContractFactory("ProvenanceRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`ProvenanceRegistry deployed to: ${address}`);
  console.log(`Set HEDERA_REGISTRY_ADDRESS=${address} in packages/nextjs/.env`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});