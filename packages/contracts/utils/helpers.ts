import {
  PLUGIN_REPO_ENS_SUBDOMAIN_NAME,
  PLUGIN_REPO_PROXY_NAME,
} from '../plugin-settings';
import {
  SupportedNetworks,
  getLatestNetworkDeployment,
  getNetworkNameByAlias,
  getPluginEnsDomain,
} from '@aragon/osx-commons-configs';
import {UnsupportedNetworkError, findEvent} from '@aragon/osx-commons-sdk';
import {
  DAO,
  DAO__factory,
  ENSSubdomainRegistrar__factory,
  ENS__factory,
  IAddrResolver__factory,
  PluginRepoFactory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
  PluginRepo,
  PluginRepoEvents,
  PluginRepo__factory,
} from '@aragon/osx-ethers';
import {setBalance} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber, ContractTransaction, ethers} from 'ethers';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

export function isLocal(hre: HardhatRuntimeEnvironment): boolean {
  return (
    hre.network.name === 'localhost' ||
    hre.network.name === 'hardhat' ||
    hre.network.name === 'coverage' ||
    hre.network.name === 'zkLocalTestnet'
  );
}

export function getProductionNetworkName(
  hre: HardhatRuntimeEnvironment
): string {
  let productionNetworkName: string;
  if (isLocal(hre)) {
    if (process.env.NETWORK_NAME) {
      productionNetworkName = process.env.NETWORK_NAME;
    } else {
      console.log(
        `No network has been provided in the '.env' file. Defaulting to '${SupportedNetworks.POLYGON}' as the production network.`
      );
      productionNetworkName = SupportedNetworks.POLYGON;
    }
  } else {
    productionNetworkName = hre.network.name;
  }

  if (getNetworkNameByAlias(productionNetworkName) === null) {
    throw new UnsupportedNetworkError(productionNetworkName);
  }

  return productionNetworkName;
}

export function pluginEnsDomain(hre: HardhatRuntimeEnvironment): string {
  const network = getNetworkNameByAlias(getProductionNetworkName(hre));
  if (network === null) {
    throw new UnsupportedNetworkError(getProductionNetworkName(hre));
  }

  const pluginEnsDomain = getPluginEnsDomain(network);
  return `${PLUGIN_REPO_ENS_SUBDOMAIN_NAME}.${pluginEnsDomain}`;
}

/**
 * try to get the plugin repo first
 * 1- env var PLUGIN_REPO_ADDRESS
 * 2- try to get the latest network deployment
 * 3- from the commons configs
 *    3.1- plugin repo factory address from env var
 *    3.2- plugin repo factory address from commons configs
 */
export async function findPluginRepo(
  hre: HardhatRuntimeEnvironment
): Promise<{pluginRepo: PluginRepo | null; ensDomain: string}> {
  const [deployer] = await hre.ethers.getSigners();
  const ensDomain = pluginEnsDomain(hre);

  // from env var
  if (process.env.PLUGIN_REPO_ADDRESS) {
    if (!isValidAddress(process.env.PLUGIN_REPO_ADDRESS)) {
      throw new Error(
        'Plugin Repo in .env is not a valid address (is not an address or is address zero)'
      );
    }

    return {
      pluginRepo: PluginRepo__factory.connect(
        process.env.PLUGIN_REPO_ADDRESS,
        deployer
      ),
      ensDomain,
    };
  }

  // from deployments
  const pluginRepo = await hre.deployments.getOrNull(PLUGIN_REPO_PROXY_NAME);
  if (pluginRepo) {
    console.log(
      'using the plugin repo from the deployments',
      pluginRepo.address
    );
    return {
      pluginRepo: PluginRepo__factory.connect(pluginRepo.address, deployer),
      ensDomain,
    };
  }

  // from commons configs
  let subdomainRegistrarAddress;
  const pluginRepoFactoryAddress = process.env.PLUGIN_REPO_FACTORY_ADDRESS;
  if (pluginRepoFactoryAddress) {
    if (!isValidAddress(pluginRepoFactoryAddress)) {
      throw new Error(
        'Plugin Repo Factory in .env is not valid address (is not an address or is address zero)'
      );
    }

    // get ENS registrar from the plugin factory provided
    const pluginRepoFactory = PluginRepoFactory__factory.connect(
      pluginRepoFactoryAddress,
      deployer
    );

    const pluginRepoRegistry = PluginRepoRegistry__factory.connect(
      await pluginRepoFactory.pluginRepoRegistry(),
      deployer
    );

    subdomainRegistrarAddress = await pluginRepoRegistry.subdomainRegistrar();
  } else {
    // get ENS registrar from the commons configs deployments
    const productionNetworkName: string = getProductionNetworkName(hre);
    const network = getNetworkNameByAlias(productionNetworkName);
    if (network === null) {
      throw new UnsupportedNetworkError(productionNetworkName);
    }
    const networkDeployments = getLatestNetworkDeployment(network);
    if (networkDeployments === null) {
      throw `Deployments are not available on network ${network}.`;
    }

    subdomainRegistrarAddress =
      networkDeployments.PluginENSSubdomainRegistrarProxy.address;
  }

  if (subdomainRegistrarAddress === ethers.constants.AddressZero) {
    // the network does not support ENS and the plugin repo could not be found by env var or deployments
    return {pluginRepo: null, ensDomain: ''};
  }

  const registrar = ENSSubdomainRegistrar__factory.connect(
    subdomainRegistrarAddress,
    deployer
  );

  // Check if the ens record exists already
  const ens = ENS__factory.connect(await registrar.ens(), deployer);
  const node = ethers.utils.namehash(ensDomain);
  const recordExists = await ens.recordExists(node);

  if (!recordExists) {
    return {pluginRepo: null, ensDomain};
  } else {
    const resolver = IAddrResolver__factory.connect(
      await ens.resolver(node),
      deployer
    );

    const pluginRepo = PluginRepo__factory.connect(
      await resolver.addr(node),
      deployer
    );
    return {
      pluginRepo,
      ensDomain,
    };
  }
}

export type EventWithBlockNumber = {
  event: ethers.utils.LogDescription;
  blockNumber: number;
};

export async function getPastVersionCreatedEvents(
  pluginRepo: PluginRepo
): Promise<EventWithBlockNumber[]> {
  const eventFilter = pluginRepo.filters['VersionCreated']();

  const logs = await pluginRepo.provider.getLogs({
    fromBlock: 0,
    toBlock: 'latest',
    address: pluginRepo.address,
    topics: eventFilter.topics,
  });

  return logs.map((log, index) => {
    return {
      event: pluginRepo.interface.parseLog(log),
      blockNumber: logs[index].blockNumber,
    };
  });
}

export type LatestVersion = {
  versionTag: PluginRepo.VersionStruct;
  pluginSetupContract: string;
  releaseMetadata: string;
  buildMetadata: string;
};

export async function createVersion(
  pluginRepoContract: string,
  pluginSetupContract: string,
  releaseNumber: number,
  releaseMetadata: string,
  buildMetadata: string
): Promise<ContractTransaction> {
  const signers = await ethers.getSigners();

  const PluginRepo = new PluginRepo__factory(signers[0]);
  const pluginRepo = PluginRepo.attach(pluginRepoContract);

  const tx = await pluginRepo.createVersion(
    releaseNumber,
    pluginSetupContract,
    buildMetadata,
    releaseMetadata
  );

  console.log(`Creating build for release ${releaseNumber} with tx ${tx.hash}`);

  const receipt = await tx.wait();

  const versionCreatedEvent = findEvent<PluginRepoEvents.VersionCreatedEvent>(
    receipt,
    pluginRepo.interface.events['VersionCreated(uint8,uint16,address,bytes)']
      .name
  );

  // Check if versionCreatedEvent is not undefined
  if (versionCreatedEvent) {
    console.log(
      `Created build ${versionCreatedEvent.args.build} for release ${
        versionCreatedEvent.args.release
      } with setup address: ${
        versionCreatedEvent.args.pluginSetup
      }, with build metadata ${ethers.utils.toUtf8String(
        buildMetadata
      )} and release metadata ${ethers.utils.toUtf8String(releaseMetadata)}`
    );
  } else {
    // Handle the case where the event is not found
    throw new Error('Failed to get VersionCreatedEvent event log');
  }
  return tx;
}

export const AragonOSxAsciiArt =
  "                                          ____   _____      \n     /\\                                  / __ \\ / ____|     \n    /  \\   _ __ __ _  __ _  ___  _ __   | |  | | (_____  __ \n   / /\\ \\ | '__/ _` |/ _` |/ _ \\| '_ \\  | |  | |\\___ \\ \\/ / \n  / ____ \\| | | (_| | (_| | (_) | | | | | |__| |____) >  <  \n /_/    \\_\\_|  \\__,_|\\__, |\\___/|_| |_|  \\____/|_____/_/\\_\\ \n                      __/ |                                 \n                     |___/                                  \n";

/**
 * try to get the management dao first
 * 1- env var MANAGEMENT_DAO_ADDRESS
 * 2- commons configs deployments
 */
export async function getManagementDao(
  hre: HardhatRuntimeEnvironment
): Promise<DAO> {
  const [deployer] = await hre.ethers.getSigners();

  const managementDaoAddress = process.env.MANAGEMENT_DAO_ADDRESS;

  if (managementDaoAddress) {
    // getting the management DAO from the env var
    if (!isValidAddress(managementDaoAddress)) {
      throw new Error(
        'Management DAO address in .env is not valid address (is not an address or is address zero)'
      );
    }

    return DAO__factory.connect(managementDaoAddress, deployer);
  }

  // getting the management DAO from the commons configs deployments
  const productionNetworkName = getProductionNetworkName(hre);
  const network = getNetworkNameByAlias(productionNetworkName);
  if (network === null) {
    throw new UnsupportedNetworkError(productionNetworkName);
  }
  const networkDeployments = getLatestNetworkDeployment(network);
  if (networkDeployments === null) {
    throw `Deployments are not available on network ${network}.`;
  }

  return DAO__factory.connect(
    networkDeployments.ManagementDAOProxy.address,
    deployer
  );
}

/**
 * try to get the plugin repo factory first
 * 1- env var PLUGIN_REPO_FACTORY_ADDRESS
 * 2- commons configs deployments
 */
export async function getPluginRepoFactory(
  hre: HardhatRuntimeEnvironment
): Promise<PluginRepoFactory> {
  const [deployer] = await hre.ethers.getSigners();

  // from env var
  if (process.env.PLUGIN_REPO_FACTORY_ADDRESS) {
    if (!isValidAddress(process.env.PLUGIN_REPO_FACTORY_ADDRESS)) {
      throw new Error(
        'Plugin Repo Factory address in .env is not valid address (is not an address or is address zero)'
      );
    }
    return PluginRepoFactory__factory.connect(
      process.env.PLUGIN_REPO_FACTORY_ADDRESS,
      deployer
    );
  }

  // from commons configs deployments
  const productionNetworkName = getProductionNetworkName(hre);
  const network = getNetworkNameByAlias(productionNetworkName);
  if (network === null) {
    throw new UnsupportedNetworkError(productionNetworkName);
  }
  const networkDeployments = getLatestNetworkDeployment(network);
  if (networkDeployments === null) {
    throw `Deployments are not available on network ${network}.`;
  }

  return PluginRepoFactory__factory.connect(
    networkDeployments.PluginRepoFactory.address,
    deployer
  );
}

export async function impersonatedManagementDaoSigner(
  hre: HardhatRuntimeEnvironment
): Promise<SignerWithAddress> {
  return await (async () => {
    const managementDaoProxy = getManagementDao(hre);
    const signer = await hre.ethers.getImpersonatedSigner(
      (
        await managementDaoProxy
      ).address
    );
    await setBalance(signer.address, BigNumber.from(10).pow(18));
    return signer;
  })();
}

export function isValidAddress(address: string): boolean {
  // check if the address is valid and not zero address
  return (
    ethers.utils.isAddress(address) && address !== ethers.constants.AddressZero
  );
}

export async function publishPlaceholderVersion(
  placeholderSetup: string,
  versionBuild: number,
  versionRelease: number,
  pluginRepo: PluginRepo,
  signer: any
) {
  for (let i = 0; i < versionBuild - 1; i++) {
    console.log('Publishing placeholder', i + 1);

    const tx = await pluginRepo
      .connect(signer)
      .createVersion(
        versionRelease,
        placeholderSetup,
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(`{}`)),
        ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes('placeholder-setup-build')
        )
      );

    await tx.wait();
  }
}

export async function frameworkSupportsENS(
  pluginRepoFactory: PluginRepoFactory
): Promise<boolean> {
  const [deployer] = await ethers.getSigners();
  const pluginRepoRegistry = PluginRepoRegistry__factory.connect(
    await pluginRepoFactory.pluginRepoRegistry(),
    deployer
  );
  const subdomainRegistrar = await pluginRepoRegistry.subdomainRegistrar();

  return subdomainRegistrar !== ethers.constants.AddressZero;
}
