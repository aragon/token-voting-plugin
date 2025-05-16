import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {
  TestGovernanceERC20,
  TestGovernanceERC20__factory,
} from '../../typechain';
import {MajorityVotingBase} from '../../typechain/src';
import {ZK_SYNC_NETWORKS} from '../../utils/zkSync';
import {loadFixtureCustom} from '../test-utils/fixture';
import {
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
import {ARTIFACT_SOURCES} from '../test-utils/wrapper';
import {
  DAO_PERMISSIONS,
  PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS,
  TIME,
  pctToRatio,
} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import hre, {ethers} from 'hardhat';

const AlreadyInitializedSignature =
  TokenVoting__factory.createInterface().encodeErrorResult(
    'AlreadyInitialized'
  );

describe('Upgrades', () => {
  it('upgrades to a new implementation', async () => {
    const {dao, defaultInitData} = await loadFixtureCustom(fixture);

    await deployAndUpgradeSelfCheck(
      0,
      1,
      {
        initArgs: {
          dao: dao.address,
          votingSettings: defaultInitData.votingSettings,
          tokenAddress: defaultInitData.token.address,
          targetConfig: defaultInitData.targetConfig,
          minApproval: defaultInitData.minApproval,
          metadata: defaultInitData.metadata,
        },
        initializerName: 'initialize',
      },
      ARTIFACT_SOURCES.TokenVoting,
      ARTIFACT_SOURCES.TokenVoting,
      PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
      dao
    );
  });

  it('upgrades from v1.0.0 with `initializeFrom`', async () => {
    const {deployer, dao, defaultInitData, encodeDataForUpgrade} =
      await loadFixtureCustom(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_0_0__factory(deployer);

    const data = [
      0,
      1,
      {
        initArgs: [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
        ],
        initializerName: 'initialize',
        reinitializerName: 'initialize',
        reinitArgs: [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
          defaultInitData.targetConfig,
          defaultInitData.minApproval,
          defaultInitData.metadata,
        ],
      },
      ARTIFACT_SOURCES.TokenVoting_V1_0_0,
      ARTIFACT_SOURCES.TokenVoting,
      PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
      dao,
    ];

    // Ensure that on the `upgrade`, `initialize` can not be called.
    try {
      await deployAndUpgradeFromToCheck(
        // @ts-expect-error correct data type
        ...data
      );
      throw new Error('');
    } catch (err: any) {
      if (!ZK_SYNC_NETWORKS.includes(hre.network.name)) {
        if (err.data == undefined) {
          throw err;
        }
        expect(err.data).to.equal(AlreadyInitializedSignature);
      }
    }

    // @ts-expect-error `data` doesn't have type.
    data[2].reinitializerName = 'initializeFrom';
    // @ts-expect-error types castings will work
    data[2].reinitArgs = [latestInitializerVersion, encodeDataForUpgrade];

    const {proxy, fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        // @ts-expect-error correct data type
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
    expect(await newTokenVoting.getMetadata()).to.equal(
      defaultInitData.metadata
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
        defaultInitData.minApproval,
        defaultInitData.metadata
      )
    ).to.be.revertedWithCustomError(proxy, 'AlreadyInitialized');
  });

  it('upgrades from v1.3.0 with `initializeFrom`', async () => {
    const {deployer, dao, defaultInitData, encodeDataForUpgrade} =
      await loadFixtureCustom(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_3_0__factory(deployer);

    const data = [
      0,
      1,
      {
        initArgs: [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
        ],
        initializerName: 'initialize',
        reinitializerName: 'initialize',
        reinitArgs: [
          dao.address,
          defaultInitData.votingSettings,
          defaultInitData.token.address,
          defaultInitData.targetConfig,
          defaultInitData.minApproval,
          defaultInitData.metadata,
        ],
      },
      ARTIFACT_SOURCES.TokenVoting_V1_3_0,
      ARTIFACT_SOURCES.TokenVoting,
      PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
      dao,
    ];

    // Ensure that on the `upgrade`, `initialize` can not be called.
    try {
      await deployAndUpgradeFromToCheck(
        // @ts-expect-error correct data type
        ...data
      );
      throw new Error('');
    } catch (err: any) {
      if (!ZK_SYNC_NETWORKS.includes(hre.network.name)) {
        if (err.data == undefined) {
          throw err;
        }
        expect(err.data).to.equal(AlreadyInitializedSignature);
      }
    }

    // @ts-expect-error `data` doesn't have type.
    data[2].reinitializerName = 'initializeFrom';
    // @ts-expect-error types castings will work
    data[2].reinitArgs = [latestInitializerVersion, encodeDataForUpgrade];

    const {proxy, fromImplementation, toImplementation} =
      await deployAndUpgradeFromToCheck(
        // @ts-expect-error correct data type
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
    expect(await newTokenVoting.getMetadata()).to.equal(
      defaultInitData.metadata
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
        defaultInitData.minApproval,
        defaultInitData.metadata
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
    metadata: string;
  };
  encodeDataForUpgrade: string;
};

async function fixture(): Promise<FixtureResult> {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const dummyMetadata = '0x12345678';

  const dao = await createDaoProxy(deployer, dummyMetadata);

  const token = await hre.wrapper.deploy(ARTIFACT_SOURCES.TestGovernanceERC20, {
    args: [
      dao.address,
      'GOV',
      'GOV',
      {
        receivers: [],
        amounts: [],
      },
    ],
  });

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
    metadata: '0x11',
  };

  // initial data is minApproval and targetConfig
  const encodeDataForUpgrade = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'address', 'uint8', 'bytes'],
    [
      defaultInitData.minApproval,
      defaultInitData.targetConfig.target,
      defaultInitData.targetConfig.operation,
      defaultInitData.metadata,
    ]
  );

  return {
    deployer,
    alice,
    bob,
    carol,
    dao,
    defaultInitData,
    encodeDataForUpgrade,
  };
}
