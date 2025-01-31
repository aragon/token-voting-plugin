import {PLUGIN_REPO_ENS_SUBDOMAIN_NAME} from '../plugin-settings';
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
  PluginRepo,
  PluginRepoEvents,
  PluginRepo__factory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
} from '@aragon/osx-ethers';
import {setBalance} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber, ContractTransaction} from 'ethers';
import {LogDescription} from 'ethers/lib/utils';
import {ethers} from 'hardhat';
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

export async function findPluginRepo(
  hre: HardhatRuntimeEnvironment
): Promise<{pluginRepo: PluginRepo | null; ensDomain: string}> {
  const [deployer] = await hre.ethers.getSigners();

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
      ensDomain: '',
    };
  }

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
    // the network does not support ENS
    return {pluginRepo: null, ensDomain: ''};
  }

  const registrar = ENSSubdomainRegistrar__factory.connect(
    subdomainRegistrarAddress,
    deployer
  );

  // Check if the ens record exists already
  const ens = ENS__factory.connect(await registrar.ens(), deployer);
  const ensDomain = pluginEnsDomain(hre);
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
  event: LogDescription;
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

export function isValidAddress(address: string): boolean {
  // check if the address is valid and not zero address
  return (
    ethers.utils.isAddress(address) && address !== ethers.constants.AddressZero
  );
}

export const AragonOSxAsciiArt =
  "                                          ____   _____      \n     /\\                                  / __ \\ / ____|     \n    /  \\   _ __ __ _  __ _  ___  _ __   | |  | | (_____  __ \n   / /\\ \\ | '__/ _` |/ _` |/ _ \\| '_ \\  | |  | |\\___ \\ \\/ / \n  / ____ \\| | | (_| | (_| | (_) | | | | | |__| |____) >  <  \n /_/    \\_\\_|  \\__,_|\\__, |\\___/|_| |_|  \\____/|_____/_/\\_\\ \n                      __/ |                                 \n                     |___/                                  \n";

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
