import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {TestGovernanceERC20} from '../../typechain';
import {MajorityVotingBase} from '../../typechain/src';
import {
  Operation,
  TargetConfig,
  latestInitializerVersion,
} from '../test-utils/token-voting-constants';
import {
  TokenVoting_V1_1__factory,
  TokenVoting_V1_2__factory,
  TokenVoting__factory,
} from '../test-utils/typechain-versions';
import {
  deployAndUpgradeFromToCheck,
  deployAndUpgradeSelfCheck,
  getProtocolVersion,
} from '../test-utils/uups-upgradeable';
import {VotingMode} from '../test-utils/voting-helpers';
import {
  PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS,
  TIME,
  pctToRatio,
} from '@aragon/osx-commons-sdk';
import {DAO, TestGovernanceERC20__factory} from '@aragon/osx-ethers';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {ethers} from 'hardhat';

describe('Upgrades', () => {
  it('upgrades to a new implementation', async () => {
    const {deployer, alice, dao, defaultInitData} = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);

    await deployAndUpgradeSelfCheck(
      deployer,
      alice,
      [
        dao.address,
        defaultInitData.votingSettings,
        defaultInitData.token.address,
        defaultInitData.targetConfig,
        defaultInitData.minApproval,
      ],
      'initialize',
      currentContractFactory,
      PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
      dao
    );
  });

  it('upgrades from v1.1', async () => {
    const {deployer, alice, dao, defaultInitData} = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_1__factory(deployer);

    const {fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        deployer,
        alice,
        [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
        ],
        'initialize',
        legacyContractFactory,
        currentContractFactory,
        PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
        dao
      );

    expect(toImplementation).to.not.equal(fromImplementation); // The build did change

    const fromProtocolVersion = await getProtocolVersion(
      legacyContractFactory.attach(fromImplementation)
    );
    const toProtocolVersion = await getProtocolVersion(
      currentContractFactory.attach(toImplementation)
    );

    expect(fromProtocolVersion).to.not.deep.equal(toProtocolVersion);
    expect(fromProtocolVersion).to.deep.equal([1, 0, 0]);
    expect(toProtocolVersion).to.deep.equal([1, 4, 0]); // TODO Check this automatically
  });

  /// TODO: why is this saying from 1.3.0 ?
  it('from v1.2', async () => {
    const {deployer, alice, dao, defaultInitData} = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_2__factory(deployer);

    const {fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        deployer,
        alice,
        [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
        ],
        'initialize',
        legacyContractFactory,
        currentContractFactory,
        PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
        dao
      );

    expect(toImplementation).to.not.equal(fromImplementation);

    const fromProtocolVersion = await getProtocolVersion(
      legacyContractFactory.attach(fromImplementation)
    );
    const toProtocolVersion = await getProtocolVersion(
      currentContractFactory.attach(toImplementation)
    );

    expect(fromProtocolVersion).to.not.deep.equal(toProtocolVersion);
    expect(fromProtocolVersion).to.deep.equal([1, 0, 0]);
    expect(toProtocolVersion).to.deep.equal([1, 4, 0]); // TODO Check this automatically
  });

  it('upgrades from v1.1 with `initializeFrom`', async () => {
    const {
      deployer,
      alice,
      dao,
      defaultInitData,
      defaultMinApproval,
      defaultTargetConfig,
    } = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_1__factory(deployer);

    // initial data is minApproval and targetConfig
    const encodedDefaultInitialData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'address', 'uint8'],
      [
        defaultMinApproval,
        defaultTargetConfig.target,
        defaultTargetConfig.operation,
      ]
    );

    const {proxy, fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        deployer,
        alice,
        [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
        ],
        'initialize',
        legacyContractFactory,
        currentContractFactory,
        PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
        dao,
        'initializeFrom',
        [latestInitializerVersion, encodedDefaultInitialData]
      );

    expect(toImplementation).to.not.equal(fromImplementation); // The build did change

    const fromProtocolVersion = await getProtocolVersion(
      legacyContractFactory.attach(fromImplementation)
    );
    const toProtocolVersion = await getProtocolVersion(
      currentContractFactory.attach(toImplementation)
    );

    expect(fromProtocolVersion).to.not.deep.equal(toProtocolVersion);
    expect(fromProtocolVersion).to.deep.equal([1, 0, 0]);
    expect(toProtocolVersion).to.deep.equal([1, 4, 0]);

    // expects the plugin was reinitialized
    const newTokenVoting = TokenVoting__factory.connect(
      proxy.address,
      deployer
    );

    expect(await newTokenVoting.minApproval()).to.equal(defaultMinApproval);
    expect((await newTokenVoting.getTargetConfig()).target).to.deep.equal(
      defaultTargetConfig.target
    );
    expect((await newTokenVoting.getTargetConfig()).operation).to.deep.equal(
      defaultTargetConfig.operation
    );
  });

  it('from v1.2 with `initializeFrom`', async () => {
    const {
      deployer,
      alice,
      dao,
      defaultInitData,
      defaultMinApproval,
      defaultTargetConfig,
    } = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_2__factory(deployer);

    // initial data is minApproval and targetConfig
    const encodedDefaultInitialData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'address', 'uint8'],
      [
        defaultMinApproval,
        defaultTargetConfig.target,
        defaultTargetConfig.operation,
      ]
    );

    const {proxy, fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        deployer,
        alice,
        [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
        ],
        'initialize',
        legacyContractFactory,
        currentContractFactory,
        PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
        dao,
        'initializeFrom',
        [latestInitializerVersion, encodedDefaultInitialData]
      );

    expect(toImplementation).to.not.equal(fromImplementation);

    const fromProtocolVersion = await getProtocolVersion(
      legacyContractFactory.attach(fromImplementation)
    );
    const toProtocolVersion = await getProtocolVersion(
      currentContractFactory.attach(toImplementation)
    );

    expect(fromProtocolVersion).to.not.deep.equal(toProtocolVersion);
    expect(fromProtocolVersion).to.deep.equal([1, 0, 0]);
    expect(toProtocolVersion).to.deep.equal([1, 4, 0]);

    // expects the plugin was reinitialized
    const newTokenVoting = TokenVoting__factory.connect(
      proxy.address,
      deployer
    );

    expect(await newTokenVoting.minApproval()).to.equal(defaultMinApproval);
    expect((await newTokenVoting.getTargetConfig()).target).to.deep.equal(
      defaultTargetConfig.target
    );
    expect((await newTokenVoting.getTargetConfig()).operation).to.deep.equal(
      defaultTargetConfig.operation
    );
  });
});

type FixtureResult = {
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  carol: SignerWithAddress;
  dao: DAO;
  defaultInitData: {
    votingSettings: MajorityVotingBase.VotingSettingsStruct;
    token: TestGovernanceERC20;
    minApproval: BigNumber;
    targetConfig: TargetConfig;
  };
  defaultMinApproval: BigNumber;
  defaultTargetConfig: TargetConfig;
};

async function fixture(): Promise<FixtureResult> {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const dummyMetadata = '0x12345678';

  const dao = await createDaoProxy(deployer, dummyMetadata);

  const token = await new TestGovernanceERC20__factory(deployer).deploy(
    dao.address,
    'GOV',
    'GOV',
    {
      receivers: [],
      amounts: [],
    }
  );

  const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
    votingMode: VotingMode.EarlyExecution,
    supportThreshold: pctToRatio(50),
    minParticipation: pctToRatio(20),
    minDuration: TIME.HOUR,
    minProposerVotingPower: 0,
  };

  // Create an initialized plugin clone
  const defaultInitData = {
    votingSettings,
    token: token,
    minApproval: pctToRatio(10),
    targetConfig: {
      target: dao.address,
      operation: Operation.call,
    },
  };

  const defaultMinApproval = pctToRatio(10);

  // Deploy an initialized plugin proxy.
  const defaultTargetConfig: TargetConfig = {
    target: dao.address,
    operation: Operation.call,
  };

  return {
    deployer,
    alice,
    bob,
    carol,
    dao,
    defaultInitData,
    defaultMinApproval,
    defaultTargetConfig,
  };
}
