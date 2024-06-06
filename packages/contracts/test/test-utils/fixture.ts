import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {
  TestGovernanceERC20,
  TestGovernanceERC20__factory,
  ProxyFactory__factory,
} from '../../typechain';
import {ITokenVoting as MajorityVotingBase} from '../../typechain';
import {ProxyCreatedEvent} from '../../typechain/@aragon/osx-commons-contracts/src/utils/deployment/ProxyFactory';
import {UPDATE_VOTING_SETTINGS_PERMISSION_ID} from '../test-utils/token-voting-constants';
import {
  TokenVoting__factory,
  TokenVoting,
} from '../test-utils/typechain-versions';
import {VotingMode} from '../test-utils/voting-helpers';
import {
  findEvent,
  TIME,
  pctToRatio,
  DAO_PERMISSIONS,
} from '@aragon/osx-commons-sdk';
import {DAO, DAOStructs} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {ethers} from 'hardhat';

export type GlobalFixtureResult = {
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  carol: SignerWithAddress;
  dave: SignerWithAddress;
  eve: SignerWithAddress;
  frank: SignerWithAddress;
  grace: SignerWithAddress;
  harold: SignerWithAddress;
  ivan: SignerWithAddress;
  judy: SignerWithAddress;
  mallory: SignerWithAddress;
  initializedPlugin: TokenVoting;
  uninitializedPlugin: TokenVoting;
  defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
  token: TestGovernanceERC20;
  dao: DAO;
  dummyActions: DAOStructs.ActionStruct[];
  dummyMetadata: string;
};

export async function globalFixture(): Promise<GlobalFixtureResult> {
  const [
    deployer,
    alice,
    bob,
    carol,
    dave,
    eve,
    frank,
    grace,
    harold,
    ivan,
    judy,
    mallory,
  ] = await ethers.getSigners();

  // Deploy a DAO proxy.
  const dummyMetadata = '0x12345678';
  const dao = await createDaoProxy(deployer, dummyMetadata);

  // Deploy a plugin proxy factory containing the plugin implementation.
  const pluginImplementation = await new TokenVoting__factory(
    deployer
  ).deploy();
  const proxyFactory = await new ProxyFactory__factory(deployer).deploy(
    pluginImplementation.address
  );

  const token = await new TestGovernanceERC20__factory(deployer).deploy(
    dao.address,
    'gov',
    'GOV',
    {
      receivers: [],
      amounts: [],
    }
  );

  // Deploy an initialized plugin proxy.
  const defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
    votingMode: VotingMode.EarlyExecution,
    supportThreshold: pctToRatio(50),
    minParticipation: pctToRatio(20),
    minDuration: TIME.HOUR,
    minProposerVotingPower: 0,
  };

  const pluginInitdata = pluginImplementation.interface.encodeFunctionData(
    'initialize',
    [dao.address, defaultVotingSettings, token.address]
  );
  const deploymentTx1 = await proxyFactory.deployUUPSProxy(pluginInitdata);
  const proxyCreatedEvent1 = findEvent<ProxyCreatedEvent>(
    await deploymentTx1.wait(),
    proxyFactory.interface.getEvent('ProxyCreated').name
  );
  const initializedPlugin = TokenVoting__factory.connect(
    proxyCreatedEvent1.args.proxy,
    deployer
  );

  // Grant deployer the permission to update the voting settings
  await dao
    .connect(deployer)
    .grant(
      initializedPlugin.address,
      deployer.address,
      UPDATE_VOTING_SETTINGS_PERMISSION_ID
    );

  // Grant the plugin the permission to execute on the DAO
  await dao
    .connect(deployer)
    .grant(
      dao.address,
      initializedPlugin.address,
      DAO_PERMISSIONS.EXECUTE_PERMISSION_ID
    );

  // Deploy an uninitialized plugin proxy.
  const deploymentTx2 = await proxyFactory.deployUUPSProxy([]);
  const proxyCreatedEvent2 = findEvent<ProxyCreatedEvent>(
    await deploymentTx2.wait(),
    proxyFactory.interface.getEvent('ProxyCreated').name
  );
  const uninitializedPlugin = TokenVoting__factory.connect(
    proxyCreatedEvent2.args.proxy,
    deployer
  );

  // Provide a dummy action array.
  const dummyActions: DAOStructs.ActionStruct[] = [
    {
      to: deployer.address,
      data: '0x1234',
      value: 0,
    },
  ];

  return {
    deployer,
    alice,
    bob,
    carol,
    dave,
    eve,
    frank,
    grace,
    harold,
    ivan,
    judy,
    mallory,
    initializedPlugin,
    uninitializedPlugin,
    defaultVotingSettings,
    token,
    dao,
    dummyActions,
    dummyMetadata,
  };
}
