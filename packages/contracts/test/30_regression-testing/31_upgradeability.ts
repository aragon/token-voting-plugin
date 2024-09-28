import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {TestGovernanceERC20, TokenVoting} from '../../typechain';
import {MajorityVotingBase} from '../../typechain/src';
import {
  INITIALIZE_SIGNATURE,
  latestInitializerVersion,
  Operation,
  TargetConfig,
} from '../test-utils/token-voting-constants';
import {
  TokenVoting_V1_0_0__factory,
  TokenVoting_V1_3_0__factory,
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

const AlreadyInitializedSignature =
  TokenVoting__factory.createInterface().encodeErrorResult(
    'AlreadyInitialized'
  );

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
      INITIALIZE_SIGNATURE,
      currentContractFactory,
      PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
      dao
    );
  });

  it('upgrades from v1.0.0 with `initializeFrom`', async () => {
    const {deployer, alice, dao, defaultInitData, encodedParamsForUpgrade} =
      await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_0_0__factory(deployer);

    const data = [
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
      'initialize',
      [
        dao.address,
        defaultInitData.votingSettings,
        defaultInitData.token.address,
        defaultInitData.targetConfig,
        defaultInitData.minApproval,
      ],
    ];

    // Ensure that on the `upgrade`, `initialize` can not be called.
    try {
      await deployAndUpgradeFromToCheck(
        // @ts-ignore
        ...data
      );
      throw new Error('');
    } catch (err: any) {
      expect(err.data).to.equal(AlreadyInitializedSignature);
    }

    data[8] = 'initializeFrom';
    // @ts-ignore
    data[9] = [latestInitializerVersion, encodedParamsForUpgrade];

    const {proxy, fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        // @ts-ignore
        ...data
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

    expect(await newTokenVoting.minApproval()).to.equal(
      defaultInitData.minApproval
    );
    expect(await newTokenVoting.getTargetConfig()).to.deep.equal([
      defaultInitData.targetConfig.target,
      defaultInitData.targetConfig.operation,
    ]);

    // `initializeFrom` was called on the upgrade, make sure
    // `initialize` can not be called.
    await expect(
      proxy.initialize(
        dao.address,
        defaultInitData.votingSettings,
        defaultInitData.token.address,
        defaultInitData.targetConfig,
        defaultInitData.minApproval
      )
    ).to.be.revertedWithCustomError(proxy, 'AlreadyInitialized');
  });

  it('upgrades from v1.3.0 with `initializeFrom`', async () => {
    const {deployer, alice, dao, defaultInitData, encodedParamsForUpgrade} =
      await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_3_0__factory(deployer);

    const data = [
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
      'initialize',
      [
        dao.address,
        defaultInitData.votingSettings,
        defaultInitData.token.address,
        defaultInitData.targetConfig,
        defaultInitData.minApproval,
      ],
    ];

    // Ensure that on the `upgrade`, `initialize` can not be called.
    try {
      await deployAndUpgradeFromToCheck(
        // @ts-ignore
        ...data
      );
      throw new Error('');
    } catch (err: any) {
      expect(err.data).to.equal(AlreadyInitializedSignature);
    }
    data[8] = 'initializeFrom';
    // @ts-ignore
    data[9] = [latestInitializerVersion, encodedParamsForUpgrade];

    const {proxy, fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        // @ts-ignore
        ...data
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

    expect(await newTokenVoting.minApproval()).to.equal(
      defaultInitData.minApproval
    );
    expect(await newTokenVoting.getTargetConfig()).to.deep.equal([
      defaultInitData.targetConfig.target,
      defaultInitData.targetConfig.operation,
    ]);

    // `initializeFrom` was called on the upgrade, make sure
    // `initialize` can not be called.
    await expect(
      proxy.initialize(
        dao.address,
        defaultInitData.votingSettings,
        defaultInitData.token.address,
        defaultInitData.targetConfig,
        defaultInitData.minApproval
      )
    ).to.be.revertedWithCustomError(proxy, 'AlreadyInitialized');
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
  encodedParamsForUpgrade: string;
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

  // initial data is minApproval and targetConfig
  const encodedParamsForUpgrade = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'address', 'uint8'],
    [
      defaultInitData.minApproval,
      defaultInitData.targetConfig.target,
      defaultInitData.targetConfig.operation,
    ]
  );

  return {
    deployer,
    alice,
    bob,
    carol,
    dao,
    defaultInitData,
    encodedParamsForUpgrade,
  };
}
