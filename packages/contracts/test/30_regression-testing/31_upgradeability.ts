import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {TestGovernanceERC20} from '../../typechain';
import {MajorityVotingBase} from '../../typechain/src';
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
      ],
      'initialize',
      currentContractFactory,
      PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
      dao
    );
  });

  it('upgrades from v1.0.0', async () => {
    const {deployer, alice, dao, defaultInitData} = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_0_0__factory(deployer);

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

  it('from v1.3.0', async () => {
    const {deployer, alice, dao, defaultInitData} = await loadFixture(fixture);
    const currentContractFactory = new TokenVoting__factory(deployer);
    const legacyContractFactory = new TokenVoting_V1_3_0__factory(deployer);

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
  };
};

async function fixture(): Promise<FixtureResult> {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const dummyMetadata = ethers.utils.hexlify(
    ethers.utils.toUtf8Bytes('0x123456789')
  );

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
  };

  return {
    deployer,
    alice,
    bob,
    carol,
    dao,
    defaultInitData,
  };
}
