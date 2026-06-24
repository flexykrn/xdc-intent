require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-toolbox');
require('hardhat-deploy');
require('@nomicfoundation/hardhat-verify');
require('hardhat-gas-reporter');
require('solidity-coverage');

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
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
        version: '0.8.20',
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
    },
  },
  paths: {
    sources: '../contracts/contracts',
    tests: './test',
    cache: './cache',
    artifacts: '../contracts/artifacts',
  },
};

module.exports = config;
