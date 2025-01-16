import {TestingFork} from './types/hardhat';
import RichAccounts from './utils/zksync-rich-accounts';
import {
  addRpcUrlToNetwork,
  networks as osxCommonsConfigNetworks,
  SupportedNetworks,
} from '@aragon/osx-commons-configs';
import '@matterlabs/hardhat-zksync-deploy';
import '@matterlabs/hardhat-zksync-ethers';
import '@matterlabs/hardhat-zksync-node';
import '@matterlabs/hardhat-zksync-solc';
import '@matterlabs/hardhat-zksync-upgradable';
import '@matterlabs/hardhat-zksync-verify';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-network-helpers';
import '@typechain/hardhat';
import {config as dotenvConfig} from 'dotenv';
import {BigNumber, ethers} from 'ethers';
import fs from 'fs';
import 'hardhat-deploy';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import {extendEnvironment, HardhatUserConfig, task} from 'hardhat/config';
import {
  HardhatNetworkAccountsUserConfig,
  HardhatRuntimeEnvironment,
} from 'hardhat/types';
import type {NetworkUserConfig} from 'hardhat/types';
import {resolve} from 'path';
import 'solidity-coverage';
import 'solidity-coverage';
import 'solidity-docgen';

const dotenvConfigPath: string = process.env.DOTENV_CONFIG_PATH || '../../.env';
dotenvConfig({path: resolve(__dirname, dotenvConfigPath), override: true});

// check alchemy Api key existence
if (process.env.ALCHEMY_API_KEY) {
  addRpcUrlToNetwork(process.env.ALCHEMY_API_KEY);
} else {
  throw new Error('ALCHEMY_API_KEY in .env not set');
}

// Fetch the accounts specified in the .env file
function specifiedAccounts(): string[] {
  return process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.split(',') : [];
}

task('build-contracts').setAction(async (args, hre) => {
  await hre.run('compile');
  // TODO:Claudia (Is there a way without copying/pasting manually ? `paths` object below in the config
  // creates `build` folder correctly, but it always appends `zk` in the end.
  if (
    hre.network.name === 'zkTestnet' ||
    hre.network.name === 'zkLocalTestnet' ||
    hre.network.name === 'zkMainnet'
  ) {
    // Copy zkSync specific build artifacts and cache to the default directories.
    // This ensures that we don't need to change import paths for artifacts in the project.
    fs.cpSync('./build/artifacts-zk', './artifacts', {
      recursive: true,
      force: true,
    });
    fs.cpSync('./build/cache-zk', './cache', {recursive: true, force: true});

    return;
  }

  fs.cpSync('./build/artifacts', './artifacts', {recursive: true, force: true});
  fs.cpSync('./build/cache', './cache', {recursive: true, force: true});
});

task('deploy-contracts').setAction(async (args, hre) => {
  await hre.run('build-contracts');
  await hre.run('deploy');
});

task('test-contracts').setAction(async (args, hre) => {
  await hre.run('build-contracts');
  const imp = await import('./test/test-utils/wrapper');

  const wrapper = await imp.Wrapper.create(
    hre.network.name,
    hre.ethers.provider
  );
  hre.wrapper = wrapper;

  await hre.run('test');
});

// Extend HardhatRuntimeEnvironment
extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre.aragonToVerifyContracts = [];
});

const namedAccounts = {
  deployer: 0,
  alice: 1,
  bob: 2,
  carol: 3,
  dave: 4,
  eve: 5,
  frank: 6,
  grace: 7,
  harold: 8,
  ivan: 9,
  judy: 10,
  mallory: 11,
};

const config: HardhatUserConfig = {
  namedAccounts,
  defaultNetwork: 'zkLocalTestnet',
  networks: {
    zkLocalTestnet: {
      url: 'http://127.0.0.1:8011',
      ethNetwork: 'http://127.0.0.1:8545',
      zksync: true,
      deploy: ['./deploy'],
      gas: 15000000,
      blockGasLimit: 30000000,
      accounts: RichAccounts,
    },
    zkTestnet: {
      url: 'https://sepolia.era.zksync.dev',
      ethNetwork: 'sepolia',
      zksync: true,
      verifyURL:
        'https://explorer.sepolia.era.zksync.dev/contract_verification',
      deploy: ['./deploy'],
      accounts: specifiedAccounts(),
      forceDeploy: true,
    },
    zkMainnet: {
      url: 'https://mainnet.era.zksync.io',
      ethNetwork: 'mainnet',
      zksync: true,
      verifyURL:
        'https://zksync2-mainnet-explorer.zksync.io/contract_verification',
      deploy: ['./deploy'],
      accounts: specifiedAccounts(),
      forceDeploy: true,
    },
  },
  paths: {
    artifacts: './build/artifacts',
    cache: './build/cache',
    sources: './src',
    tests: './test',
    deploy: './deploy',
  },
  mocha: {
    require: ['test/test-utils/override-time.ts'],
    timeout: 6000000,
  },
  zksolc: {
    compilerSource: 'binary',
    version: '1.5.0',
  },
  solidity: {
    version: '0.8.17',
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: 'none',
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
};

export default config;
