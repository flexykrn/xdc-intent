import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    apothem: {
      chainId: 51,
      url: process.env.XDC_TESTNET_RPC || 'https://erpc.apothem.network',
      accounts: process.env.DEPLOYER_PRIVATE_KEY && process.env.DEPLOYER_PRIVATE_KEY !== '0x...'
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      gasPrice: parseInt(process.env.GAS_PRICE_GWEI || '25') * 1e9,
    },
    xdc: {
      chainId: 50,
      url: process.env.XDC_MAINNET_RPC || 'https://erpc.xinfin.network',
      accounts: process.env.DEPLOYER_PRIVATE_KEY && process.env.DEPLOYER_PRIVATE_KEY !== '0x...'
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      gasPrice: parseInt(process.env.GAS_PRICE_GWEI || '25') * 1e9,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
