require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    compilers: [
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
