import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {ProxyFactory__factory, ITokenVoting} from '../../typechain';
import {ProxyCreatedEvent} from '../../typechain/@aragon/osx-commons-contracts/src/utils/deployment/ProxyFactory';
import {
  TokenVoting,
  TokenVoting__factory,
} from '../test-utils/typechain-versions';
import {VotingMode} from '../test-utils/voting-helpers';
import {TIME, findEvent} from '@aragon/osx-commons-sdk';
import {pctToRatio} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('updateVotingSettings', async () => {
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let votingBase: TokenVoting;
  let dao: DAO;
  const mockTokenAddress = ethers.constants.AddressZero;
  let votingSettings: ITokenVoting.VotingSettingsStruct;

  before(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];
    dao = await createDaoProxy(signers[0], '0x00');
  });

  beforeEach(async () => {
    votingSettings = {
      votingMode: VotingMode.EarlyExecution,
      supportThreshold: pctToRatio(50),
      minParticipation: pctToRatio(20),
      minDuration: TIME.HOUR,
      minProposerVotingPower: 0,
    };

    const pluginImplementation = await new TokenVoting__factory(
      signers[0]
    ).deploy();
    const proxyFactory = await new ProxyFactory__factory(deployer).deploy(
      pluginImplementation.address
    );
    const deploymentTx1 = await proxyFactory.deployUUPSProxy([]);
    const proxyCreatedEvent1 = findEvent<ProxyCreatedEvent>(
      await deploymentTx1.wait(),
      proxyFactory.interface.getEvent('ProxyCreated').name
    );
    votingBase = TokenVoting__factory.connect(
      proxyCreatedEvent1.args.proxy,
      deployer
    );

    await dao.grant(
      votingBase.address,
      deployer.address,
      ethers.utils.id('UPDATE_VOTING_SETTINGS_PERMISSION')
    );
  });

  beforeEach(async () => {
    await votingBase.initialize(dao.address, votingSettings, mockTokenAddress);
  });

  it('reverts if the support threshold specified equals 100%', async () => {
    votingSettings.supportThreshold = pctToRatio(100);
    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.be.revertedWithCustomError(votingBase, 'RatioOutOfBounds')
      .withArgs(pctToRatio(100).sub(1), votingSettings.supportThreshold);
  });

  it('reverts if the support threshold specified exceeds 100%', async () => {
    votingSettings.supportThreshold = pctToRatio(1000);
    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.be.revertedWithCustomError(votingBase, 'RatioOutOfBounds')
      .withArgs(pctToRatio(100).sub(1), votingSettings.supportThreshold);
  });

  it('reverts if the support threshold specified equals 100%', async () => {
    votingSettings.supportThreshold = pctToRatio(1000);
    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.be.revertedWithCustomError(votingBase, 'RatioOutOfBounds')
      .withArgs(pctToRatio(100).sub(1), votingSettings.supportThreshold);
  });

  it('reverts if the minimum participation specified exceeds 100%', async () => {
    votingSettings.minParticipation = pctToRatio(1000);

    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.be.revertedWithCustomError(votingBase, 'RatioOutOfBounds')
      .withArgs(pctToRatio(100), votingSettings.minParticipation);
  });

  it('reverts if the minimal duration is shorter than one hour', async () => {
    votingSettings.minDuration = TIME.HOUR - 1;
    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.be.revertedWithCustomError(votingBase, 'MinDurationOutOfBounds')
      .withArgs(TIME.HOUR, votingSettings.minDuration);
  });

  it('reverts if the minimal duration is longer than one year', async () => {
    votingSettings.minDuration = TIME.YEAR + 1;
    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.be.revertedWithCustomError(votingBase, 'MinDurationOutOfBounds')
      .withArgs(TIME.YEAR, votingSettings.minDuration);
  });

  it('should change the voting settings successfully', async () => {
    await expect(votingBase.updateVotingSettings(votingSettings))
      .to.emit(votingBase, 'VotingSettingsUpdated')
      .withArgs(
        votingSettings.votingMode,
        votingSettings.supportThreshold,
        votingSettings.minParticipation,
        votingSettings.minDuration,
        votingSettings.minProposerVotingPower
      );
  });
});
