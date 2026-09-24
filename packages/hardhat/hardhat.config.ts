import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../nextjs/.env" });
dotenv.config();

const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY || "";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hederaTestnet: {
      url: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
      chainId: 296,
    },
    hederaMainnet: {
      url: process.env.HEDERA_RPC_URL || "https://mainnet.hashio.io/api",
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
      chainId: 295,
    },
  },
};

export default config;