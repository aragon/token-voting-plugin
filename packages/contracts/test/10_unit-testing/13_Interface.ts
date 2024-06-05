import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {
  IERC165Upgradeable__factory,
  IPlugin__factory,
  IProposal__factory,
  IProtocolVersion__factory,
  ProxyFactory__factory,
  ITokenVoting__factory,
  ITokenVoting,
} from '../../typechain';
import {ProxyCreatedEvent} from '../../typechain/@aragon/osx-commons-contracts/src/utils/deployment/ProxyFactory';
import {IMembership__factory} from '../../typechain/factories/@aragon/osx-v1.0.0/core/plugin/membership';
import {TOKEN_VOTING_INTERFACE} from '../test-utils/token-voting-constants';
import {
  TokenVoting,
  TokenVoting__factory,
} from '../test-utils/typechain-versions';
import {VotingMode} from '../test-utils/voting-helpers';
import {TIME, findEvent} from '@aragon/osx-commons-sdk';
import {getInterfaceId} from '@aragon/osx-commons-sdk';
import {pctToRatio} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('ERC-165', async () => {
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let plugin: TokenVoting;
  let dao: DAO;
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
    plugin = TokenVoting__factory.connect(
      proxyCreatedEvent1.args.proxy,
      deployer
    );
  });

  it('does not support the empty interface', async () => {
    expect(await plugin.supportsInterface('0xffffffff')).to.be.false;
  });

  it('supports the `IERC165Upgradeable` interface', async () => {
    const iface = IERC165Upgradeable__factory.createInterface();
    expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
  });

  it('supports the `IPlugin` interface', async () => {
    const iface = IPlugin__factory.createInterface();
    expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
  });

  it('supports the `IProtocolVersion` interface', async () => {
    const iface = IProtocolVersion__factory.createInterface();
    expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
  });

  it('supports the `IProposal` interface', async () => {
    const iface = IProposal__factory.createInterface();
    expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
  });

  it('supports the `ITokenVoting` interface', async () => {
    const iface = ITokenVoting__factory.createInterface();
    expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
  });

  it('supports the `IMembership` interface', async () => {
    const iface = IMembership__factory.createInterface();
    expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
  });

  it('supports the `TokenVoting` interface', async () => {
    const interfaceId = getInterfaceId(TOKEN_VOTING_INTERFACE);
    expect(await plugin.supportsInterface(interfaceId)).to.be.true;
  });
});
