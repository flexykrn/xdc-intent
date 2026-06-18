import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.19',
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
      forking: process.env.FORK_URL
        ? {
            url: process.env.FORK_URL,
            blockNumber: parseInt(process.env.FORK_BLOCK_NUMBER || '0'),
          }
        : undefined,
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
  etherscan: {
    apiKey: {
      apothem: process.env.XDC_API_KEY || '',
      xdc: process.env.XDC_API_KEY || '',
    },
    customChains: [
      {
        network: 'apothem',
        chainId: 51,
        urls: {
          apiURL: 'https://explorer.apothem.network/api',
          browserURL: 'https://explorer.apothem.network',
        },
      },
      {
        network: 'xdc',
        chainId: 50,
        urls: {
          apiURL: 'https://explorer.xinfin.network/api',
          browserURL: 'https://explorer.xinfin.network',
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
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
