import {
  PLUGIN_REPO_ENS_SUBDOMAIN_NAME,
  PLUGIN_CONTRACT_NAME,
} from '../../plugin-settings';
import {
  findPluginRepo,
  getProductionNetworkName,
  pluginEnsDomain,
  isValidAddress,
} from '../../utils/helpers';
import {saveToDeployedJson} from '../helpers';
import {
  getLatestNetworkDeployment,
  getNetworkNameByAlias,
} from '@aragon/osx-commons-configs';
import {
  UnsupportedNetworkError,
  findEventTopicLog,
} from '@aragon/osx-commons-sdk';
import {
  PluginRepoRegistryEvents,
  PluginRepoRegistry__factory,
  PluginRepo__factory,
  PluginRepoFactory__factory,
} from '@aragon/osx-ethers';
import {ethers} from 'hardhat';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import path from 'path';

/**
 * Creates a plugin repo under Aragon's ENS base domain with subdomain requested in the `./plugin-settings.ts` file.
 * @param {HardhatRuntimeEnvironment} hre
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // todo change this log
  console.log(
    `Creating the '${pluginEnsDomain(
      hre
    )}' plugin repo through Aragon's 'PluginRepoFactory'...`
  );

  const [deployer] = await hre.ethers.getSigners();

  let pluginRepoFactoryAddress = process.env.PLUGIN_REPO_FACTORY_ADDRESS;
  let subdomainRegistrar;

  if (pluginRepoFactoryAddress) {
    if (!isValidAddress(pluginRepoFactoryAddress)) {
      throw new Error('Plugin Repo Factory in .env is not of type Address');
    }
    // use this factory
    const pluginRepoFactory = PluginRepoFactory__factory.connect(
      pluginRepoFactoryAddress,
      deployer
    );

    const pluginRepoRegistry = PluginRepoRegistry__factory.connect(
      await pluginRepoFactory.pluginRepoRegistry(),
      deployer
    );
    subdomainRegistrar = await pluginRepoRegistry.subdomainRegistrar();
  } else {
    // get the factory from osx-commons-configs deployments

    // Get the Aragon `PluginRepoFactory` from the `osx-commons-configs`
    const productionNetworkName = getProductionNetworkName(hre);
    const network = getNetworkNameByAlias(productionNetworkName);
    if (network === null) {
      throw new UnsupportedNetworkError(productionNetworkName);
    }
    const networkDeployments = getLatestNetworkDeployment(network);
    if (networkDeployments === null) {
      throw `Deployments are not available on network ${network}.`;
    }

    pluginRepoFactoryAddress = networkDeployments.PluginRepoFactory.address;

    subdomainRegistrar =
      networkDeployments.PluginENSSubdomainRegistrarProxy.address;
  }
  // subdomain will depend on if the framework has the ens or not
  const subdomain =
    subdomainRegistrar !== ethers.constants.AddressZero
      ? PLUGIN_REPO_ENS_SUBDOMAIN_NAME
      : '';

  const pluginRepoFactory = PluginRepoFactory__factory.connect(
    pluginRepoFactoryAddress,
    deployer
  );

  // Create the `PluginRepo` through the Aragon `PluginRepoFactory`
  const tx = await pluginRepoFactory.createPluginRepo(
    subdomain,
    deployer.address
  );

  // Get the PluginRepo address and deployment block number from the txn and event therein
  const eventLog =
    findEventTopicLog<PluginRepoRegistryEvents.PluginRepoRegisteredEvent>(
      await tx.wait(),
      PluginRepoRegistry__factory.createInterface(),
      'PluginRepoRegistered'
    );

  const pluginRepo = PluginRepo__factory.connect(
    eventLog.args.pluginRepo,
    deployer
  );

  console.log(
    `PluginRepo ${
      subdomainRegistrar !== ethers.constants.AddressZero
        ? 'with ens:' + pluginEnsDomain(hre)
        : 'without ens'
    }  deployed at '${pluginRepo.address}'.`
  );

  hre.aragonToVerifyContracts.push({
    address: pluginRepo.address,
    args: [],
  });

  saveToDeployedJson(
    [
      {
        name: PLUGIN_CONTRACT_NAME + 'PluginRepo',
        address: pluginRepo.address,
        blockNumber: tx.blockNumber,
        txHash: tx.hash,
      },
      {
        name: PLUGIN_CONTRACT_NAME + 'PluginRepoImplementation',
        address: await pluginRepoFactory.pluginRepoBase(),
        blockNumber: null,
        txHash: null,
      },
    ],
    true
  );
};

export default func;
func.tags = ['CreateRepo'];

/**
 * Skips `PluginRepo` creation if the ENS name is claimed already
 * @param {HardhatRuntimeEnvironment} hre
 */
func.skip = async (hre: HardhatRuntimeEnvironment) => {
  console.log(`\n🏗️  ${path.basename(__filename)}:`);

  // try getting the plugin repo.
  const res = await findPluginRepo(hre);
  const pluginRepoAddress = res.pluginRepo?.address;
  const ensDomain = res.ensDomain;

  if (pluginRepoAddress) {
    if (ensDomain != '') {
      console.log(
        `ENS name '${ensDomain}' was claimed already at '${pluginRepoAddress}' on network '${getProductionNetworkName(
          hre
        )}'. Skipping deployment...`
      );
    } else {
      console.log(
        `Plugin Repo already deployed at '${pluginRepoAddress}' on network '${getProductionNetworkName(
          hre
        )}'. Skipping deployment...`
      );
    }

    hre.aragonToVerifyContracts.push({
      address: pluginRepoAddress,
      args: [],
    });

    return true;
  } else {
    console.log('Deploying Plugin Repo');

    return false;
  }
};
