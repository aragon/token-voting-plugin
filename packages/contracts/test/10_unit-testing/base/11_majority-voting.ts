import {createDaoProxy} from '../../20_integration-testing/test-helpers';
import {
  MajorityVotingMock,
  IERC165Upgradeable__factory,
  IPlugin__factory,
  IProposal__factory,
  IMajorityVoting__factory,
  MajorityVotingMock__factory,
  IProtocolVersion__factory,
  ProxyFactory__factory,
} from '../../../typechain';
import {ProxyCreatedEvent} from '../../../typechain/@aragon/osx-commons-contracts/src/utils/deployment/ProxyFactory';
import {MajorityVotingBase} from '../../../typechain/src/MajorityVotingBase';
import {
  MAJORITY_VOTING_BASE_INTERFACE,
  MAJORITY_VOTING_BASE_OLD_INTERFACE,
} from '../../test-utils/majority-voting-constants';
import {
  Operation,
  SET_TARGET_CONFIG_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
  TargetConfig,
} from '../../test-utils/token-voting-constants';
import {IMajorityVoting_V1_2__factory} from '../../test-utils/typechain-versions';
import {VotingMode} from '../../test-utils/voting-helpers';
import {TIME, findEvent} from '@aragon/osx-commons-sdk';
import {getInterfaceId} from '@aragon/osx-commons-sdk';
import {pctToRatio} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {ethers} from 'hardhat';

describe('MajorityVotingMock', function () {
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let votingBase: MajorityVotingMock;
  let dao: DAO;

  let votingSettings: MajorityVotingBase.VotingSettingsStruct;
  let minApproval: BigNumber;
  let targetConfig: TargetConfig;

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
    minApproval = pctToRatio(10);

    targetConfig = {
      target: dao.address,
      operation: Operation.call,
    };

    const pluginImplementation = await new MajorityVotingMock__factory(
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
    votingBase = MajorityVotingMock__factory.connect(
      proxyCreatedEvent1.args.proxy,
      deployer
    );

    await dao.grant(
      votingBase.address,
      deployer.address,
      ethers.utils.id('UPDATE_VOTING_SETTINGS_PERMISSION')
    );
  });

  describe('initialize', async () => {
    it('reverts if trying to re-initialize', async () => {
      await votingBase.initializeMock(
        dao.address,
        votingSettings,
        targetConfig,
        minApproval
      );

      await expect(
        votingBase.initializeMock(
          dao.address,
          votingSettings,
          targetConfig,
          minApproval
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  describe('ERC-165', async () => {
    it('does not support the empty interface', async () => {
      expect(await votingBase.supportsInterface('0xffffffff')).to.be.false;
    });

    it('supports the `IERC165Upgradeable` interface', async () => {
      const iface = IERC165Upgradeable__factory.createInterface();
      expect(await votingBase.supportsInterface(getInterfaceId(iface))).to.be
        .true;
    });

    it('supports the `IPlugin` interface', async () => {
      const iface = IPlugin__factory.createInterface();
      expect(await votingBase.supportsInterface(getInterfaceId(iface))).to.be
        .true;
    });

    it('supports the `IProtocolVersion` interface', async () => {
      const iface = IProtocolVersion__factory.createInterface();
      expect(await votingBase.supportsInterface(getInterfaceId(iface))).to.be
        .true;
    });

    it('supports the `IProposal` interface', async () => {
      const iface = IProposal__factory.createInterface();
      expect(await votingBase.supportsInterface(getInterfaceId(iface))).to.be
        .true;
    });

    it('supports the `IMajorityVoting` interface', async () => {
      const iface = IMajorityVoting__factory.createInterface();
      expect(await votingBase.supportsInterface(getInterfaceId(iface))).to.be
        .true;
    });

    it('supports the `IMajorityVoting` OLD interface', async () => {
      const oldIface = IMajorityVoting_V1_2__factory.createInterface();
      expect(await votingBase.supportsInterface(getInterfaceId(oldIface))).to.be
        .true;
    });

    it('supports the `MajorityVotingBase` interface', async () => {
      expect(
        await votingBase.supportsInterface(
          getInterfaceId(MAJORITY_VOTING_BASE_INTERFACE)
        )
      ).to.be.true;
    });

    it('supports the `MajorityVotingBase` OLD interface', async () => {
      expect(
        await votingBase.supportsInterface(
          getInterfaceId(MAJORITY_VOTING_BASE_OLD_INTERFACE)
        )
      ).to.be.true;
    });
  });

  describe('updateVotingSettings', async () => {
    beforeEach(async () => {
      await votingBase.initializeMock(
        dao.address,
        votingSettings,
        targetConfig,
        minApproval
      );
    });

    it('reverts if caller is unauthorized', async () => {
      const unauthorizedAddr = signers[5];
      await expect(
        votingBase
          .connect(unauthorizedAddr)
          .updateVotingSettings(votingSettings)
      )
        .to.be.revertedWithCustomError(votingBase, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          votingBase.address,
          unauthorizedAddr.address,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID
        );
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

  describe('updateMinApprovals', async () => {
    beforeEach(async () => {
      await votingBase.initializeMock(
        dao.address,
        votingSettings,
        targetConfig,
        minApproval
      );
    });

    it('reverts if the minimum approval specified exceeds 100%', async () => {
      minApproval = pctToRatio(1000);

      await expect(votingBase.updateMinApprovals(minApproval))
        .to.be.revertedWithCustomError(votingBase, 'RatioOutOfBounds')
        .withArgs(pctToRatio(100), minApproval);
    });

    it('reverts if caller is unauthorized', async () => {
      const unauthorizedAddr = signers[5];
      await expect(
        votingBase
          .connect(unauthorizedAddr)
          .updateVotingSettings(votingSettings)
      )
        .to.be.revertedWithCustomError(votingBase, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          votingBase.address,
          unauthorizedAddr.address,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID
        );
    });

    it('should change the minimum approval successfully', async () => {
      await expect(votingBase.updateMinApprovals(minApproval))
        .to.emit(votingBase, 'VotingMinApprovalUpdated')
        .withArgs(minApproval);
    });
  });

  describe('updateTargetConfig', async () => {
    beforeEach(async () => {
      await votingBase.initializeMock(
        dao.address,
        votingSettings,
        targetConfig,
        minApproval
      );

      await dao.grant(
        votingBase.address,
        deployer.address,
        SET_TARGET_CONFIG_PERMISSION_ID
      );
    });

    it('should change the minimum approval successfully', async () => {
      const newTargetConfig = {
        target: votingBase.address,
        operation: Operation.delegatecall,
      };

      await votingBase.setTargetConfig(newTargetConfig);

      expect(await votingBase.getTargetConfig()).to.deep.equal([
        newTargetConfig.target,
        Operation.delegatecall,
      ]);
    });
  });
});
