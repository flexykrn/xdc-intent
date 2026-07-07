import { HardhatUserConfig } from "hardhat/config.js";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "@nomicfoundation/hardhat-verify";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.19',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: '0.8.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
      forking: process.env.FORK_URL
        ? {
            url: process.env.FORK_URL,
            blockNumber: parseInt(process.env.FORK_BLOCK_NUMBER || '0'),
          }
        : undefined,
    },
    apothem: {
      chainId: 51,
      url: 'https://rpc.apothem.network',
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
    sepolia: {
      chainId: 11155111,
      url: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY && process.env.DEPLOYER_PRIVATE_KEY !== '0x...'
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: {
      xdc: process.env.ETHERSCAN_API_KEY || '',
      apothem: process.env.ETHERSCAN_API_KEY || '',
      sepolia: process.env.ETHERSCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'xdc',
        chainId: 50,
        urls: {
          apiURL: 'https://api.xdcscan.io/api',
          browserURL: 'https://xdcscan.io',
        },
      },
      {
        network: 'apothem',
        chainId: 51,
        urls: {
          apiURL: 'https://api-testnet.xdcscan.com/api',
          browserURL: 'https://testnet.xdcscan.com',
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    gasPrice: 25,
    token: 'XDC',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  sourcify: {
    enabled: true,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    treasury: {
      default: 1,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
    deploy: './deploy',
  },
};

export default config;
