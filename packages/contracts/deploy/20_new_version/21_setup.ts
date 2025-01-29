import governanceERC20Artifact from '../../artifacts/src/ERC20/governance/GovernanceERC20.sol/GovernanceERC20.json';
import governanceWrappedERC20Artifact from '../../artifacts/src/ERC20/governance/GovernanceWrappedERC20.sol/GovernanceWrappedERC20.json';
import {
  GOVERNANCE_ERC20_DEPLOY_ARGS,
  GOVERNANCE_WRAPPED_ERC20_DEPLOY_ARGS,
} from '../../plugin-settings';
import {
  GOVERNANCE_ERC20_CONTRACT_NAME,
  GOVERNANCE_WRAPPED_ERC20_CONTRACT_NAME,
} from '../../plugin-settings';
import {ZK_SYNC_NETWORKS} from '../../utils/zkSync';
import {pluginSetupContractName} from '../helpers';
import {saveToDeployedJson} from '../helpers';
import hre from 'hardhat';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import path from 'path';

const PLUGIN_SETUP_CONTRACT_NAME = pluginSetupContractName(hre);

/**
 * Deploys the plugin setup contract with the plugin implementation inside.
 * In the case of the token voting plugin, we also need to deploy the governance ERC20
 * and the wrapped variants.
 * @param {HardhatRuntimeEnvironment} hre
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log(`\n🏗️  ${path.basename(__filename)}:`);

  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  // IMPORTANT: Even though TokenVotingSetupZkSync doesn't need
  // deployments of governance erc20 contracts, we still do it
  // as it helps us to verify the contract one time and every
  // deployment of it by users automatically will be verified.
  // This is handy as deployments on ZkSync anyways is cheap.

  // Deploy the bases for the TokenVotingSetup
  const governanceERC20DeployResult = await deploy(
    GOVERNANCE_ERC20_CONTRACT_NAME,
    {
      contract: governanceERC20Artifact,
      from: deployer,
      args: GOVERNANCE_ERC20_DEPLOY_ARGS,
      log: true,
    }
  );

  const governanceWrappedERC20DeployResult = await deploy(
    GOVERNANCE_WRAPPED_ERC20_CONTRACT_NAME,
    {
      contract: governanceWrappedERC20Artifact,
      from: deployer,
      args: GOVERNANCE_WRAPPED_ERC20_DEPLOY_ARGS,
      log: true,
    }
  );

  const args = ZK_SYNC_NETWORKS.includes(hre.network.name)
    ? []
    : [
        governanceERC20DeployResult.address,
        governanceWrappedERC20DeployResult.address,
      ];

  const res = await deploy(PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: args,
    log: true,
  });

  saveToDeployedJson([
    {
      name: GOVERNANCE_ERC20_CONTRACT_NAME,
      address: governanceERC20DeployResult.address,
      blockNumber: governanceERC20DeployResult.receipt?.blockNumber,
      txHash: governanceERC20DeployResult.transactionHash,
    },
    {
      name: GOVERNANCE_WRAPPED_ERC20_CONTRACT_NAME,
      address: governanceWrappedERC20DeployResult.address,
      blockNumber: governanceWrappedERC20DeployResult.receipt?.blockNumber,
      txHash: governanceWrappedERC20DeployResult.transactionHash,
    },
  ]);

  console.log(
    `Deployed '${PLUGIN_SETUP_CONTRACT_NAME}' contract at '${res.address}'`
  );
};

export default func;
func.tags = [PLUGIN_SETUP_CONTRACT_NAME, 'NewVersion', 'Deployment'];
