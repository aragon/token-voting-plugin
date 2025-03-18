import {
  PLUGIN_SETUP_CONTRACT_NAME,
  VOTING_POWER_CONDITION_CONTRACT_NAME,
} from '../../plugin-settings';
import {TokenVotingSetup__factory} from '../../typechain';
import {TokenVoting__factory} from '../../typechain/factories/src';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import path from 'path';

/**
 * Deploys the voting power condition contract.
 * @param {HardhatRuntimeEnvironment} hre
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log(`\n🏗️  ${path.basename(__filename)}:`);
  console.log(
    `Deploy a dummy ${VOTING_POWER_CONDITION_CONTRACT_NAME} contract, only for the purpose of verification on explorers`
  );

  const {deployments} = hre;
  const {deploy} = deployments;
  const [deployer] = await hre.ethers.getSigners();

  // Get the plugin setup address
  const setupDeployment = await deployments.get(PLUGIN_SETUP_CONTRACT_NAME);
  const setup = TokenVotingSetup__factory.connect(
    setupDeployment.address,
    deployer
  );
  // Get the plugin implementation address
  const implementationAddress = await setup.implementation();

  const res = await deploy(VOTING_POWER_CONDITION_CONTRACT_NAME, {
    from: deployer.address,
    args: [implementationAddress],
    log: true,
  });

  hre.aragonToVerifyContracts.push({
    address: res.address,
    args: [implementationAddress],
  });

  console.log(
    `Deployed '${VOTING_POWER_CONDITION_CONTRACT_NAME}' contract at '${res.address}'`
  );
};

export default func;
func.tags = [VOTING_POWER_CONDITION_CONTRACT_NAME, 'NewVersion'];
