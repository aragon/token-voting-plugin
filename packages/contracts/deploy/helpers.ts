import {
  PLUGIN_SETUP_CONTRACT_NAME,
  PLUGIN_SETUP_CONTRACT_NAME_ZKSYNC,
} from '../plugin-settings';
import {VersionTag} from '../test/test-utils/psp/types';
import {
  ENSRegistry__factory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
  PluginRepo__factory,
} from '../typechain';
import {VersionCreatedEvent} from '../typechain/PluginRepo';
import {PluginRepoRegisteredEvent} from '../typechain/PluginRepoRegistry';
import {isLocal, pluginDomainEnv} from '../utils/environment';
import {ZK_SYNC_NETWORKS} from '../utils/zkSync';
import {
  getNetworkNameByAlias,
  getLatestNetworkDeployment,
} from '@aragon/osx-commons-configs';
import {findEvent, findEventTopicLog, Operation} from '@aragon/osx-commons-sdk';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {Contract} from 'ethers';
import {ethers} from 'hardhat';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

// TODO: Add support for L2 such as Arbitrum. (https://discuss.ens.domains/t/register-using-layer-2/688)
// Make sure you own the ENS set in the {{NETWORK}}_ENS_DOMAIN variable in .env
export const ENS_ADDRESSES: {[key: string]: string} = {
  mainnet: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  goerli: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  sepolia: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
};

export const ENS_PUBLIC_RESOLVERS: {[key: string]: string} = {
  goerli: '0x19c2d5d0f035563344dbb7be5fd09c8dad62b001',
  mainnet: '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41',
  sepolia: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
};

export const MANAGEMENT_DAO_METADATA = {
  name: 'Aragon Management DAO',
  description:
    'Aragon OSx includes a group of global smart contracts that allow for a DAO ecosystem to be built on top. These contracts will require future improvements and general maintenance. The Management DAO is intended to perform such maintenance tasks and holds the permissions to deliver any new capabilities that are added in the future.',
  avatar:
    'https://ipfs.eth.aragon.network/ipfs/QmVyy3ci7F2zHG6JUJ1XbcwLKuxWrQ6hqNvSnjmDmdYJzP/',
  links: [
    {
      name: 'Web site',
      url: 'https://www.aragon.org',
    },
    {
      name: 'Developer Portal',
      url: 'https://devs.aragon.org/',
    },
  ],
};

export const DAO_PERMISSIONS = [
  'ROOT_PERMISSION',
  'UPGRADE_DAO_PERMISSION',
  'SET_SIGNATURE_VALIDATOR_PERMISSION',
  'SET_TRUSTED_FORWARDER_PERMISSION',
  'SET_METADATA_PERMISSION',
  'REGISTER_STANDARD_CALLBACK_PERMISSION',
];

export async function getContractAddress(
  contractName: string,
  hre: HardhatRuntimeEnvironment
): Promise<string> {
  const {deployments, network} = hre;

  let networkName = network.name;

  if (hre.testingFork.network) {
    networkName = hre.testingFork.network;
  }

  try {
    const contract = await deployments.get(contractName);
    if (contract) {
      return contract.address;
    }
  } catch (e) {
    // prettier-ignore
  }

  try {
    if (!hre.testingFork.osxVersion && !hre.testingFork.activeContracts) {
      console.log('==========================');
      console.log('Warning: osxVersion is not set');
      console.log('==========================');
    }

    const activeContracts = hre.testingFork.activeContracts;

    if (activeContracts && activeContracts[networkName][contractName]) {
      return activeContracts[networkName][contractName];
    }
  } catch (e) {
    // prettier-ignore
  }

  return getLatestContractAddress(contractName, hre);
}

export function getLatestContractAddress(
  contractName: string,
  hre: HardhatRuntimeEnvironment
): string {
  let networkName = hre.network.name;

  if (hre.testingFork.network) {
    networkName = hre.testingFork.network;
  }

  const osxNetworkName = getNetworkNameByAlias(networkName);
  if (!osxNetworkName) {
    if (isLocal(hre.network)) {
      return '';
    }
    throw new Error(`Failed to find network ${networkName}`);
  }

  const latestNetworkDeployment = getLatestNetworkDeployment(osxNetworkName);
  if (latestNetworkDeployment && contractName in latestNetworkDeployment) {
    // safe cast due to conditional above, but we return the fallback string anyhow
    const key = contractName as keyof typeof latestNetworkDeployment;
    return latestNetworkDeployment[key]?.address ?? '';
  }
  return '';
}

export async function detemineDeployerNextAddress(
  index: number,
  deployer: SignerWithAddress
): Promise<string> {
  const [owner] = await ethers.getSigners();
  const nonce = await owner.getTransactionCount();
  const futureAddress = ethers.utils.getContractAddress({
    from: deployer.address,
    nonce: nonce + index,
  });
  return futureAddress;
}

export async function createPluginRepo(
  hre: HardhatRuntimeEnvironment,
  pluginName: string,
  subdomain: string
): Promise<void> {
  const {network} = hre;
  const signers = await ethers.getSigners();

  const pluginDomain = pluginDomainEnv(network);
  if (
    await isENSDomainRegistered(
      `${subdomain}.${pluginDomain}`,
      await getENSAddress(hre),
      signers[0]
    )
  ) {
    // not beeing able to register the plugin repo means that something is not right with the framework deployment used.
    // Either a frontrun happened or something else. Thus we abort here
    throw new Error(`${subdomain} is already present! Aborting...`);
  }

  const pluginRepoFactoryAddress = await getContractAddress(
    'PluginRepoFactory',
    hre
  );

  const pluginRepoFactoryFactory = new PluginRepoFactory__factory(signers[0]);
  const pluginRepoFactoryContract = pluginRepoFactoryFactory.attach(
    pluginRepoFactoryAddress
  );

  const {deployer} = await hre.getNamedAccounts();

  const tx = await pluginRepoFactoryContract.createPluginRepo(
    subdomain,
    deployer
  );
  console.log(
    `Creating & registering repo for ${pluginName} with tx ${tx.hash}`
  );

  const event = findEventTopicLog<PluginRepoRegisteredEvent>(
    await tx.wait(),
    PluginRepoRegistry__factory.createInterface(),
    'PluginRepoRegistered'
  );
  const repoAddress = event.args.pluginRepo;

  hre.aragonPluginRepos[pluginName] = repoAddress;

  console.log(
    `Created & registered repo for ${pluginName} at address: ${repoAddress}` //, with contentURI ${ethers.utils.toUtf8String(releaseMetadata)}`
  );
}

export async function createVersion(
  pluginRepoContract: string,
  pluginSetupContract: string,
  releaseNumber: number,
  releaseMetadata: string,
  buildMetadata: string
): Promise<void> {
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

  const versionCreatedEvent = findEvent<VersionCreatedEvent>(
    receipt,
    'VersionCreated'
  );

  console.log(
    `Created build ${versionCreatedEvent.args.build} for release ${
      versionCreatedEvent.args.release
    } with setup address: ${
      versionCreatedEvent.args.pluginSetup
    }, with build metadata ${ethers.utils.toUtf8String(
      buildMetadata
    )} and release metadata ${ethers.utils.toUtf8String(releaseMetadata)}`
  );
}

export type LatestVersion = {
  versionTag: VersionTag;
  pluginSetupContract: string;
  releaseMetadata: string;
  buildMetadata: string;
};

function isSorted(latestVersions: LatestVersion[]): boolean {
  // The list of latest versions has to start with the first release, otherwise something is wrong and we must stop.
  if (latestVersions[0].versionTag[0] != 1) {
    return false;
  }

  for (let i = 0; i < latestVersions.length - 1; i++) {
    if (
      !(
        latestVersions[i + 1].versionTag[0] ==
        latestVersions[i].versionTag[0] + 1
      )
    ) {
      return false;
    }
  }
  return true;
}

export async function populatePluginRepo(
  hre: HardhatRuntimeEnvironment,
  pluginRepoName: string,
  latestVersions: LatestVersion[]
): Promise<void> {
  // make sure that the latestVersions array is sorted by version tag
  if (!isSorted(latestVersions)) {
    throw new Error(`${latestVersions} is not sorted in ascending order`);
  }

  for (const latestVersion of latestVersions) {
    const releaseNumber = latestVersion.versionTag[0];
    const latestBuildNumber = latestVersion.versionTag[1];

    const placeholderSetup = await getContractAddress('PlaceholderSetup', hre);

    const emptyJsonObject = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes('{}')
    );

    for (let i = 1; i < latestBuildNumber; i++) {
      await createVersion(
        hre.aragonPluginRepos[pluginRepoName],
        placeholderSetup,
        releaseNumber,
        emptyJsonObject,
        ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes(`ipfs://${hre.placeholderBuildCIDPath}`)
        )
      );
    }

    // create latest builds
    await createVersion(
      hre.aragonPluginRepos[pluginRepoName],
      latestVersion.pluginSetupContract,
      releaseNumber,
      latestVersion.releaseMetadata,
      latestVersion.buildMetadata
    );
  }
}

export async function checkSetManagementDao(
  contract: Contract,
  expectedDaoAddress: string
) {
  const setDAO = await contract.dao();
  if (setDAO !== expectedDaoAddress) {
    throw new Error(
      `${contract.address} has wrong DAO. Expected ${setDAO} to be ${expectedDaoAddress}`
    );
  }
}

export type Permission = {
  operation: Operation;
  where: {name: string; address: string};
  who: {name: string; address: string};
  permission: string;
  condition?: string;
  data?: string;
};

export async function checkPermission(
  permissionManagerContract: Contract,
  permission: Permission
) {
  const checkStatus = await isPermissionSetCorrectly(
    permissionManagerContract,
    permission
  );
  if (!checkStatus) {
    const {who, where, operation} = permission;
    if (operation === Operation.Grant) {
      throw new Error(
        `(${who.name}: ${who.address}) doesn't have ${permission.permission} on (${where.name}: ${where.address}) in ${permissionManagerContract.address}`
      );
    }
    throw new Error(
      `(${who.name}: ${who.address}) has ${permission.permission} on (${where.name}: ${where.address}) in ${permissionManagerContract.address}`
    );
  }
}

export async function isPermissionSetCorrectly(
  permissionManagerContract: Contract,
  {operation, where, who, permission, data = '0x'}: Permission
): Promise<boolean> {
  const permissionId = ethers.utils.id(permission);
  const isGranted = await permissionManagerContract.isGranted(
    where.address,
    who.address,
    permissionId,
    data
  );
  if (!isGranted && operation === Operation.Grant) {
    return false;
  }

  if (isGranted && operation === Operation.Revoke) {
    return false;
  }
  return true;
}

export async function managePermissions(
  permissionManagerContract: Contract,
  permissions: Permission[]
): Promise<void> {
  // filtering permission to only apply those that are needed
  const items: Permission[] = [];
  for (const permission of permissions) {
    if (await isPermissionSetCorrectly(permissionManagerContract, permission)) {
      continue;
    }
    items.push(permission);
  }

  if (items.length === 0) {
    console.log(`Contract call skipped. No permissions to set...`);
    return;
  }

  console.log(
    `Setting ${items.length} permissions. Skipped ${
      permissions.length - items.length
    }`
  );
  const tx = await permissionManagerContract.applyMultiTargetPermissions(
    items.map(item => [
      item.operation,
      item.where.address,
      item.who.address,
      item.condition || ethers.constants.AddressZero,
      ethers.utils.id(item.permission),
    ])
  );
  console.log(`Set permissions with ${tx.hash}. Waiting for confirmation...`);
  await tx.wait();

  items.forEach(permission => {
    console.log(
      `${
        permission.operation === Operation.Grant ? 'Granted' : 'Revoked'
      } the ${permission.permission} of (${permission.where.name}: ${
        permission.where.address
      }) for (${permission.who.name}: ${permission.who.address}), see (tx: ${
        tx.hash
      })`
    );
  });
}

export function pluginSetupContractName(hre: HardhatRuntimeEnvironment) {
  return ZK_SYNC_NETWORKS.includes(hre.network.name)
    ? PLUGIN_SETUP_CONTRACT_NAME_ZKSYNC
    : PLUGIN_SETUP_CONTRACT_NAME;
}

export async function isENSDomainRegistered(
  domain: string,
  ensRegistryAddress: string,
  signer: SignerWithAddress
): Promise<boolean> {
  const ensRegistryContract = ENSRegistry__factory.connect(
    ensRegistryAddress,
    signer
  );

  return ensRegistryContract.recordExists(ethers.utils.namehash(domain));
}

export async function getENSAddress(
  hre: HardhatRuntimeEnvironment
): Promise<string> {
  if (ENS_ADDRESSES[hre.network.name]) {
    return ENS_ADDRESSES[hre.network.name];
  }

  const ensDeployment = await hre.deployments.get('ENSRegistry');
  if (ensDeployment) {
    return ensDeployment.address;
  }

  throw new Error('ENS address not found.');
}

export async function getPublicResolverAddress(
  hre: HardhatRuntimeEnvironment
): Promise<string> {
  if (ENS_PUBLIC_RESOLVERS[hre.network.name]) {
    return ENS_PUBLIC_RESOLVERS[hre.network.name];
  }

  const publicResolverDeployment = await hre.deployments.get('PublicResolver');
  if (publicResolverDeployment) {
    return publicResolverDeployment.address;
  }

  throw new Error('PublicResolver address not found.');
}

export async function registerSubnodeRecord(
  domain: string,
  owner: SignerWithAddress,
  ensRegistryAddress: string,
  publicResolver: string
): Promise<string> {
  const domainSplitted = domain.split('.');
  const subdomain = domainSplitted.splice(0, 1)[0];
  const parentDomain = domainSplitted.join('.');

  const ensRegistryContract = ENSRegistry__factory.connect(
    ensRegistryAddress,
    owner
  );
  const tx = await ensRegistryContract.setSubnodeRecord(
    ethers.utils.namehash(parentDomain),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(subdomain)),
    owner.address,
    publicResolver,
    0
  );
  await tx.wait();
  return ensRegistryContract.owner(ethers.utils.namehash(domain));
}

export async function transferSubnodeRecord(
  domain: string,
  newOwner: string,
  ensRegistryAddress: string
): Promise<void> {
  const domainSplitted = domain.split('.');
  const subdomain = domainSplitted.splice(0, 1)[0];
  const parentDomain = domainSplitted.join('.');

  const [deployer] = await ethers.getSigners();

  const ensRegistryContract = ENSRegistry__factory.connect(
    ensRegistryAddress,
    deployer
  );

  const tx = await ensRegistryContract.setSubnodeOwner(
    ethers.utils.namehash(parentDomain),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(subdomain)),
    newOwner
  );
  console.log(
    `Transfering owner of ${domain} to ${newOwner} with tx ${tx.hash}`
  );
  await tx.wait();
}

// transfers owner ship of a domain and all parent domains to a new owner if it matches the expected current owner
export async function transferSubnodeChain(
  fullDomain: string,
  newOwner: string,
  currentOwner: string,
  ensRegistryAddress: string
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  const ensRegistryContract = ENSRegistry__factory.connect(
    ensRegistryAddress,
    deployer
  );

  const daoDomainSplitted = fullDomain.split('.').reverse();
  let domain = '';
  // +1 on length because we also need to check the owner of the empty domain
  for (let i = 0; i < daoDomainSplitted.length + 1; i++) {
    const domainOwner = await ensRegistryContract.callStatic.owner(
      ethers.utils.namehash(domain)
    );
    if (domainOwner !== newOwner && domainOwner === currentOwner) {
      const tx = await ensRegistryContract.setOwner(
        ethers.utils.namehash(domain),
        newOwner
      );
      console.log(
        `Changing owner of ${domain} from (currentOwner) ${domainOwner} to ${newOwner} (newOwner)`
      );
      await tx.wait();
    }

    domain = `${daoDomainSplitted[i]}.${domain}`;
    if (i === 0) {
      domain = daoDomainSplitted[i];
    }
  }
}

/**
 * Returns the management DAO' multisig address defined in the environment variables. Throws if not found
 *
 * @export
 * @param {HardhatRuntimeEnvironment} hre
 * @return {string}
 */
export function getManagementDAOMultisigAddress(
  hre: HardhatRuntimeEnvironment
): string {
  const {network} = hre;
  const address =
    process.env[`${network.name.toUpperCase()}_MANAGEMENT_DAO_MULTISIG`];
  if (!address) {
    throw new Error(
      `Failed to find management DAO multisig address in env variables for ${network.name}`
    );
  }
  return address;
}

// hh-deploy cannot process files without default exports
export default async () => {};
