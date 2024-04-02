import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {
  TestGovernanceERC20,
  TestGovernanceERC20__factory,
  IERC165Upgradeable__factory,
  IMajorityVoting__factory,
  IMembership__factory,
  IPlugin__factory,
  IProposal__factory,
  IProtocolVersion__factory,
  ProxyFactory__factory,
} from '../../typechain';
import {ProxyCreatedEvent} from '../../typechain/@aragon/osx-commons-contracts/src/utils/deployment/ProxyFactory';
import {MajorityVotingBase} from '../../typechain/src/MajorityVotingBase';
import {
  ProposalCreatedEvent,
  ProposalExecutedEvent,
} from '../../typechain/src/TokenVoting';
import {ExecutedEvent} from '../../typechain/src/mocks/DAOMock';
import {
  MAJORITY_VOTING_BASE_INTERFACE,
  VOTING_EVENTS,
} from '../test-utils/majority-voting-constants';
import {
  TOKEN_VOTING_INTERFACE,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
} from '../test-utils/token-voting-constants';
import {
  TokenVoting__factory,
  TokenVoting,
} from '../test-utils/typechain-versions';
import {
  VoteOption,
  VotingMode,
  voteWithSigners,
  setBalances,
  setTotalSupply,
} from '../test-utils/voting-helpers';
import {
  IDAO_EVENTS,
  IMEMBERSHIP_EVENTS,
  IPROPOSAL_EVENTS,
  findEvent,
  findEventTopicLog,
  proposalIdToBytes32,
  TIME,
  getInterfaceId,
  pctToRatio,
  RATIO_BASE,
  DAO_PERMISSIONS,
} from '@aragon/osx-commons-sdk';
import {DAO, DAOStructs, DAO__factory} from '@aragon/osx-ethers';
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {ethers} from 'hardhat';

type GlobalFixtureResult = {
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

async function globalFixture(): Promise<GlobalFixtureResult> {
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
  const dummyMetadata = ethers.utils.hexlify(
    ethers.utils.toUtf8Bytes('0x123456789')
  );
  const dao = await createDaoProxy(deployer, dummyMetadata);

  // Deploy a plugin proxy factory containing the multisig implementation.
  const pluginImplementation = await new TokenVoting__factory(
    deployer
  ).deploy();
  const proxyFactory = await new ProxyFactory__factory(deployer).deploy(
    pluginImplementation.address
  );

  const token = await new TestGovernanceERC20__factory(deployer).deploy(
    dao.address,
    'GOV',
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
  const proxyCreatedEvent1 = await findEvent<ProxyCreatedEvent>(
    deploymentTx1,
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
  const proxyCreatedEvent2 = await findEvent<ProxyCreatedEvent>(
    deploymentTx2,
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

describe('TokenVoting', function () {
  describe('initialize', async () => {
    it('reverts if trying to re-initialize', async () => {
      const {dao, initializedPlugin, defaultVotingSettings, token} =
        await loadFixture(globalFixture);

      await expect(
        initializedPlugin.initialize(
          dao.address,
          defaultVotingSettings,
          token.address
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('emits the `MembershipContractAnnounced` event', async () => {
      const {dao, uninitializedPlugin, defaultVotingSettings, token} =
        await loadFixture(globalFixture);
      await expect(
        await uninitializedPlugin.initialize(
          dao.address,
          defaultVotingSettings,
          token.address
        )
      )
        .to.emit(
          uninitializedPlugin,
          IMEMBERSHIP_EVENTS.MembershipContractAnnounced
        )
        .withArgs(token.address);
    });

    it('sets the voting settings', async () => {
      const {initializedPlugin, defaultVotingSettings} = await loadFixture(
        globalFixture
      );

      expect(await initializedPlugin.minDuration()).to.equal(
        defaultVotingSettings.minDuration
      );
      expect(await initializedPlugin.minParticipation()).to.equal(
        defaultVotingSettings.minParticipation
      );
      expect(await initializedPlugin.minProposerVotingPower()).to.equal(
        defaultVotingSettings.minProposerVotingPower
      );
      expect(await initializedPlugin.supportThreshold()).to.equal(
        defaultVotingSettings.supportThreshold
      );
      expect(await initializedPlugin.votingMode()).to.equal(
        defaultVotingSettings.votingMode
      );
    });

    it('sets the token', async () => {
      const {initializedPlugin, token} = await loadFixture(globalFixture);

      expect(await initializedPlugin.getVotingToken()).to.equal(token.address);
    });
  });

  describe('ERC-165', async () => {
    it('does not support the empty interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      expect(await plugin.supportsInterface('0xffffffff')).to.be.false;
    });

    it('supports the `IERC165Upgradeable` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const iface = IERC165Upgradeable__factory.createInterface();
      expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
    });

    it('supports the `IPlugin` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const iface = IPlugin__factory.createInterface();
      expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
    });

    it('supports the `IProtocolVersion` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const iface = IProtocolVersion__factory.createInterface();
      expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
    });

    it('supports the `IProposal` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const iface = IProposal__factory.createInterface();
      expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
    });

    it('supports the `IMembership` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const iface = IMembership__factory.createInterface();
      expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
    });

    it('supports the `IMajorityVoting` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const iface = IMajorityVoting__factory.createInterface();
      expect(await plugin.supportsInterface(getInterfaceId(iface))).to.be.true;
    });

    it('supports the `MajorityVotingBase` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      expect(
        await plugin.supportsInterface(
          getInterfaceId(MAJORITY_VOTING_BASE_INTERFACE)
        )
      ).to.be.true;
    });

    it('supports the `TokenVoting` interface', async () => {
      const {initializedPlugin: plugin} = await loadFixture(globalFixture);
      const interfaceId = getInterfaceId(TOKEN_VOTING_INTERFACE);
      expect(await plugin.supportsInterface(interfaceId)).to.be.true;
    });
  });

  describe('isMember', async () => {
    it('returns true if the account currently owns at least one token', async () => {
      const {alice, bob, initializedPlugin, token} = await loadFixture(
        globalFixture
      );

      await token.setBalance(alice.address, 1);

      expect(await token.balanceOf(alice.address)).to.eq(1);
      expect(await token.balanceOf(bob.address)).to.eq(0);

      expect(await token.getVotes(alice.address)).to.eq(1);
      expect(await token.getVotes(bob.address)).to.eq(0);

      expect(await initializedPlugin.isMember(alice.address)).to.be.true;
      expect(await initializedPlugin.isMember(bob.address)).to.be.false;
    });

    it('returns true if the account currently has one at least one token delegated to her/him', async () => {
      const {
        alice,
        bob,
        initializedPlugin: plugin,
        token,
      } = await loadFixture(globalFixture);

      await token.setBalance(alice.address, 1);

      expect(await token.balanceOf(alice.address)).to.eq(1);
      expect(await token.balanceOf(bob.address)).to.eq(0);

      await token.connect(alice).delegate(bob.address);

      expect(await token.getVotes(alice.address)).to.eq(0);
      expect(await token.getVotes(bob.address)).to.eq(1);

      expect(await plugin.isMember(alice.address)).to.be.true;
      expect(await plugin.isMember(bob.address)).to.be.true;
    });
  });

  describe('Proposal creation', async () => {
    describe('minProposerVotingPower == 0', async () => {
      it('creates a proposal if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await setTotalSupply(token, 1);

        // Create a proposal with alice, who has no voting power.
        const tx = await plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );

        const id = 0;
        const event = await findEvent<ProposalCreatedEvent>(
          tx,
          'ProposalCreated'
        );
        expect(event.args.proposalId).to.equal(id);
      });
    });

    describe('minProposerVotingPower > 0', async () => {
      it('reverts if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block', async () => {
        const {
          deployer,
          alice,
          bob,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const minProposerVotingPower = 123;
        const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower,
        };
        await plugin.connect(deployer).updateVotingSettings(votingSettings);

        await token.setBalance(bob.address, minProposerVotingPower);

        const endDate = (await time.latest()) + TIME.DAY;

        await expect(
          plugin
            .connect(alice)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(alice.address);

        await expect(
          plugin
            .connect(bob)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        ).not.to.be.reverted;
      });

      it('reverts if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block although having them in the last block', async () => {
        const {
          deployer,
          alice,
          bob,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const minProposerVotingPower = 123;
        const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower,
        };
        await plugin.connect(deployer).updateVotingSettings(votingSettings);

        await token.setBalance(alice.address, minProposerVotingPower);

        const endDate = (await time.latest()) + TIME.DAY;

        await ethers.provider.send('evm_setAutomine', [false]);
        const expectedSnapshotBlockNumber = (
          await ethers.provider.getBlock('latest')
        ).number;

        // Transaction 1: Transfer the tokens from alice to bob
        const tx1 = await token
          .connect(alice)
          .transfer(bob.address, votingSettings.minProposerVotingPower);

        // Transaction 2: Expect the proposal creation to fail for alice because she transferred the tokens in transaction 1
        await expect(
          plugin
            .connect(alice)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(alice.address);

        // Transaction 3: Create the proposal as bob
        const tx3 = await plugin
          .connect(bob)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );
        const id = 0;

        // Check the balances before the block is mined
        expect(await token.balanceOf(alice.address)).to.equal(
          votingSettings.minProposerVotingPower
        );
        expect(await token.balanceOf(bob.address)).to.equal(0);

        // Mine the block
        await ethers.provider.send('evm_mine', []);
        const minedBlockNumber = (await ethers.provider.getBlock('latest'))
          .number;

        // Expect all transaction receipts to be in the same block after the snapshot block.
        expect((await tx1.wait()).blockNumber).to.equal(minedBlockNumber);
        expect((await tx3.wait()).blockNumber).to.equal(minedBlockNumber);
        expect(minedBlockNumber).to.equal(expectedSnapshotBlockNumber + 1);

        // Expect the balances to have changed
        expect(await token.balanceOf(alice.address)).to.equal(0);
        expect(await token.balanceOf(bob.address)).to.equal(
          votingSettings.minProposerVotingPower
        );

        // Check the `ProposalCreatedEvent` for the creator and proposalId
        const event = await findEvent<ProposalCreatedEvent>(
          tx3,
          'ProposalCreated'
        );
        expect(event.args.proposalId).to.equal(id);
        expect(event.args.creator).to.equal(bob.address);

        // Check that the snapshot block stored in the proposal struct
        const proposal = await plugin.getProposal(id);
        expect(proposal.parameters.snapshotBlock).to.equal(
          expectedSnapshotBlockNumber
        );

        await ethers.provider.send('evm_setAutomine', [true]);
      });

      it('creates a proposal if `_msgSender` owns enough tokens  in the current block', async () => {
        const {
          deployer,
          alice,
          bob,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const minProposerVotingPower = 123;
        const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower,
        };
        await plugin.connect(deployer).updateVotingSettings(votingSettings);

        await token.setBalance(alice.address, minProposerVotingPower);

        const endDate = (await time.latest()) + TIME.DAY;

        // Check that bob who has no balance and is not a delegatee can NOT create a proposal
        await expect(
          plugin
            .connect(bob)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(bob.address);

        // Check that signers[0] who has enough balance can create a proposal
        await expect(
          plugin
            .connect(alice)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        ).not.to.be.reverted;
      });

      it('creates a proposal if `_msgSender` owns enough tokens and has delegated them to someone else in the current block', async () => {
        const {
          deployer,
          alice,
          bob,
          carol,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const minProposerVotingPower = 123;
        const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower,
        };
        await plugin.connect(deployer).updateVotingSettings(votingSettings);

        await token.setBalance(alice.address, minProposerVotingPower);

        // delegate from alice to bob
        await token.connect(alice).delegate(bob.address);

        const endDate = (await time.latest()) + TIME.DAY;

        // Check that carol who has a zero balance and is not a delegatee can NOT create a proposal
        await expect(
          plugin
            .connect(carol)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(carol.address);

        const tx = await plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );
        const event = await findEvent<ProposalCreatedEvent>(
          tx,
          'ProposalCreated'
        );
        expect(event.args.proposalId).to.equal(0);
      });

      it('creates a proposal if `_msgSender` owns no tokens but has enough tokens delegated to her/him in the current block', async () => {
        const {
          deployer,
          alice,
          bob,
          carol,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const minProposerVotingPower = 123;
        const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower,
        };
        await plugin.connect(deployer).updateVotingSettings(votingSettings);

        await token.setBalance(alice.address, minProposerVotingPower);

        const endDate = (await time.latest()) + TIME.DAY;

        // delegate from alice to bob
        await token.connect(alice).delegate(bob.address);

        // Check that carol who has a zero balance and is not a delegatee can NOT create a proposal
        await expect(
          plugin
            .connect(carol)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(carol.address);

        await expect(
          plugin
            .connect(bob)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        ).not.to.be.reverted;
      });

      it('reverts if `_msgSender` doesn not own enough tokens herself/himself and has not tokens delegated to her/him in the current block', async () => {
        const {
          deployer,
          alice,
          bob,
          initializedPlugin: plugin,
          token,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        const minProposerVotingPower = 123;
        const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower,
        };
        await plugin.connect(deployer).updateVotingSettings(votingSettings);

        await setBalances(token, [
          {
            receiver: alice.address,
            amount: 1,
          },
          {
            receiver: bob.address,
            amount: minProposerVotingPower,
          },
        ]);

        const endDate = (await time.latest()) + TIME.DAY;

        // Check that alice who has not enough tokens cannot create a proposal
        await expect(
          plugin
            .connect(alice)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(alice.address);

        // Check that alice delegating to bob does not let alice create a proposal
        await token.connect(alice).delegate(bob.address);

        await expect(
          plugin
            .connect(alice)
            .createProposal(
              dummyMetadata,
              dummyActions,
              0,
              0,
              endDate,
              VoteOption.None,
              false
            )
        )
          .to.be.revertedWithCustomError(plugin, 'ProposalCreationForbidden')
          .withArgs(alice.address);
      });
    });

    it('reverts if the total token supply is 0', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 0);

      await expect(
        plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            0,
            VoteOption.None,
            false
          )
      ).to.be.revertedWithCustomError(plugin, 'NoVotingPower');
    });

    it('reverts if the start date is set smaller than the current date', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 1);

      const currentDate = await time.latest();
      const startDateInThePast = currentDate - 1;
      const endDate = 0; // startDate + minDuration

      await expect(
        plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            startDateInThePast,
            endDate,
            VoteOption.None,
            false
          )
      )
        .to.be.revertedWithCustomError(plugin, 'DateOutOfBounds')
        .withArgs(currentDate, startDateInThePast);
    });

    it('panics if the start date is after the latest start date', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        defaultVotingSettings,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 1);

      const MAX_UINT64 = ethers.BigNumber.from(2).pow(64).sub(1);
      const latestStartDate = MAX_UINT64.sub(
        await defaultVotingSettings.minDuration
      );
      const tooLateStartDate = latestStartDate.add(1);
      const endDate = 0; // startDate + minDuration

      await expect(
        plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            tooLateStartDate,
            endDate,
            VoteOption.None,
            false
          )
      ).to.be.revertedWithPanic(0x11);
    });

    it('reverts if the end date is before the earliest end date so that min duration cannot be met', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        defaultVotingSettings,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 1);

      const startDate = (await time.latest()) + 1;
      const earliestEndDate = BigNumber.from(startDate).add(
        await defaultVotingSettings.minDuration
      );
      const tooEarlyEndDate = earliestEndDate.sub(1);

      await expect(
        plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            startDate,
            tooEarlyEndDate,
            VoteOption.None,
            false
          )
      )
        .to.be.revertedWithCustomError(plugin, 'DateOutOfBounds')
        .withArgs(earliestEndDate, tooEarlyEndDate);
    });

    it('sets the startDate to now and endDate to startDate + minDuration, if 0 is provided as an input', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        defaultVotingSettings,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 1);

      // Create a proposal with zero as an input for `_startDate` and `_endDate`
      const startDate = 0; // now
      const endDate = 0; // startDate + minDuration

      const creationTx = await plugin
        .connect(alice)
        .createProposal(
          dummyMetadata,
          [],
          0,
          startDate,
          endDate,
          VoteOption.None,
          false
        );
      const id = 0;

      const expectedStartDate = BigNumber.from(await time.latest());
      const expectedEndDate = expectedStartDate.add(
        await defaultVotingSettings.minDuration
      );

      // Check the state
      const proposal = await plugin.getProposal(id);
      expect(proposal.parameters.startDate).to.eq(expectedStartDate);
      expect(proposal.parameters.endDate).to.eq(expectedEndDate);

      // Check the event
      const event = await findEvent<ProposalCreatedEvent>(
        creationTx,
        'ProposalCreated'
      );

      expect(event.args.proposalId).to.equal(id);
      expect(event.args.creator).to.equal(alice.address);
      expect(event.args.startDate).to.equal(expectedStartDate);
      expect(event.args.endDate).to.equal(expectedEndDate);
      expect(event.args.metadata).to.equal(dummyMetadata);
      expect(event.args.actions).to.deep.equal([]);
      expect(event.args.allowFailureMap).to.equal(0);
    });

    it('ceils the `minVotingPower` value if it has a remainder', async () => {
      const {
        deployer,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      // Set the total supply to 10 tokens.
      await setTotalSupply(token, 10);

      const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
        votingMode: VotingMode.EarlyExecution,
        supportThreshold: pctToRatio(50),
        minParticipation: pctToRatio(30).add(1), // 30.0001 %, which will result in the `minVotingPower` getting ceiled to 4.
        minDuration: TIME.HOUR,
        minProposerVotingPower: 0,
      };
      await plugin.connect(deployer).updateVotingSettings(votingSettings);

      const endDate = (await time.latest()) + TIME.DAY;

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        VoteOption.None,
        false
      );
      const id = 0;
      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        'ProposalCreated'
      );
      expect(event.args.proposalId).to.equal(id);

      expect((await plugin.getProposal(id)).parameters.minVotingPower).to.eq(4); // 4 out of 10 votes must be casted for the proposal to pass
    });

    it('does not ceil the `minVotingPower` value if it has no remainder', async () => {
      const {
        deployer,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      // Set the total supply to 10 tokens.
      await setTotalSupply(token, 10);

      const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
        votingMode: VotingMode.EarlyExecution,
        supportThreshold: pctToRatio(50),
        minParticipation: pctToRatio(30), // 30.0000 %, which will result in the `minVotingPower` being 3.
        minDuration: TIME.HOUR,
        minProposerVotingPower: 0,
      };
      await plugin.connect(deployer).updateVotingSettings(votingSettings);

      const endDate = (await time.latest()) + TIME.DAY;

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        VoteOption.None,
        false
      );
      const id = 0;
      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        'ProposalCreated'
      );
      expect(event.args.proposalId).to.equal(id);

      expect((await plugin.getProposal(id)).parameters.minVotingPower).to.eq(3); // 3 out of 10 votes must be casted for the proposal to pass
    });

    it('should create a vote successfully, but not vote', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        defaultVotingSettings,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      const allowFailureMap = 1;

      await token.setBalance(alice.address, 10);

      const tx = await plugin
        .connect(alice)
        .createProposal(
          dummyMetadata,
          dummyActions,
          allowFailureMap,
          0,
          0,
          VoteOption.None,
          false
        );
      const id = 0;

      await expect(tx)
        .to.emit(plugin, IPROPOSAL_EVENTS.ProposalCreated)
        .to.not.emit(plugin, VOTING_EVENTS.VOTE_CAST);

      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        IPROPOSAL_EVENTS.ProposalCreated
      );
      expect(event.args.proposalId).to.equal(id);
      expect(event.args.creator).to.equal(alice.address);
      expect(event.args.metadata).to.equal(dummyMetadata);
      expect(event.args.actions.length).to.equal(1);
      expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
      expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
      expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
      expect(event.args.allowFailureMap).to.equal(allowFailureMap);

      const block = await ethers.provider.getBlock('latest');

      const proposal = await plugin.getProposal(id);

      expect(proposal.open).to.equal(true);
      expect(proposal.executed).to.equal(false);
      expect(proposal.allowFailureMap).to.equal(allowFailureMap);
      expect(proposal.parameters.supportThreshold).to.equal(
        await defaultVotingSettings.supportThreshold
      );

      expect(proposal.parameters.minVotingPower).to.equal(
        (await plugin.totalVotingPower(proposal.parameters.snapshotBlock))
          .mul(await defaultVotingSettings.minParticipation)
          .div(pctToRatio(100))
      );
      expect(proposal.parameters.snapshotBlock).to.equal(block.number - 1);
      expect(
        proposal.parameters.startDate.add(
          await defaultVotingSettings.minDuration
        )
      ).to.equal(proposal.parameters.endDate);

      expect(
        await plugin.totalVotingPower(proposal.parameters.snapshotBlock)
      ).to.equal(10);
      expect(proposal.tally.yes).to.equal(0);
      expect(proposal.tally.no).to.equal(0);

      expect(await plugin.canVote(1, alice.address, VoteOption.Yes)).to.equal(
        false
      );

      expect(proposal.actions.length).to.equal(1);
      expect(proposal.actions[0].to).to.equal(dummyActions[0].to);
      expect(proposal.actions[0].value).to.equal(dummyActions[0].value);
      expect(proposal.actions[0].data).to.equal(dummyActions[0].data);
    });

    it('should create a vote and cast a vote immediately', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        defaultVotingSettings,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await token.setBalance(alice.address, 10);

      const tx = await plugin
        .connect(alice)
        .createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          0,
          VoteOption.Yes,
          false
        );
      const id = 0;

      await expect(tx)
        .to.emit(plugin, IPROPOSAL_EVENTS.ProposalCreated)
        .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, alice.address, VoteOption.Yes, 10);

      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        IPROPOSAL_EVENTS.ProposalCreated
      );
      expect(event.args.proposalId).to.equal(id);
      expect(event.args.creator).to.equal(alice.address);
      expect(event.args.metadata).to.equal(dummyMetadata);
      expect(event.args.actions.length).to.equal(1);
      expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
      expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
      expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
      expect(event.args.allowFailureMap).to.equal(0);

      const block = await ethers.provider.getBlock('latest');

      const proposal = await plugin.getProposal(id);
      expect(proposal.open).to.equal(true);
      expect(proposal.executed).to.equal(false);
      expect(proposal.allowFailureMap).to.equal(0);
      expect(proposal.parameters.supportThreshold).to.equal(
        await defaultVotingSettings.supportThreshold
      );
      expect(proposal.parameters.minVotingPower).to.equal(
        (await plugin.totalVotingPower(proposal.parameters.snapshotBlock))
          .mul(await defaultVotingSettings.minParticipation)
          .div(pctToRatio(100))
      );
      expect(proposal.parameters.snapshotBlock).to.equal(block.number - 1);

      expect(
        await plugin.totalVotingPower(proposal.parameters.snapshotBlock)
      ).to.equal(10);
      expect(proposal.tally.yes).to.equal(10);
      expect(proposal.tally.no).to.equal(0);
      expect(proposal.tally.abstain).to.equal(0);
    });

    it('reverts creation when voting before the start date', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 1);

      const startDate = (await time.latest()) + TIME.HOUR;
      const endDate = startDate + TIME.DAY;

      expect(await time.latest()).to.be.lessThan(startDate);

      // Reverts if the vote option is not 'None'
      const id = 0;
      await expect(
        plugin
          .connect(alice)
          .createProposal(
            dummyMetadata,
            dummyActions,
            0,
            startDate,
            endDate,
            VoteOption.Yes,
            false
          )
      )
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, VoteOption.Yes);

      // Works if the vote option is 'None'
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        startDate,
        endDate,
        VoteOption.None,
        false
      );
      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        'ProposalCreated'
      );
      expect(event.args.proposalId).to.equal(id);
    });
  });

  describe('Voting Modes', async () => {
    function baseTests(
      localFixture: () => Promise<{
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
        defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
        token: TestGovernanceERC20;
        dao: DAO;
        dummyActions: DAOStructs.ActionStruct[];
        dummyMetadata: string;
      }>
    ) {
      it('does not allow voting, when the vote has not started yet', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const startDate = (await time.latest()) + TIME.HOUR;
        const endDate = startDate + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          startDate,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await expect(plugin.connect(alice).vote(id, VoteOption.Yes, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.Yes);
      });

      it('should not be able to vote if user has 0 token', async () => {
        const {
          mallory,
          initializedPlugin: plugin,
          token,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        // check the mallory has 0 token
        expect(await token.balanceOf(mallory.address)).to.equal(0);

        await expect(plugin.connect(mallory).vote(id, VoteOption.Yes, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, mallory.address, VoteOption.Yes);
      });

      it('increases the yes, no, and abstain count and emits correct events', async () => {
        const {
          alice,
          bob,
          carol,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await expect(plugin.connect(alice).vote(id, VoteOption.Yes, false))
          .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
          .withArgs(id, alice.address, VoteOption.Yes, 10);

        let proposal = await plugin.getProposal(id);
        expect(proposal.tally.yes).to.equal(10);
        expect(proposal.tally.yes).to.equal(10);
        expect(proposal.tally.no).to.equal(0);
        expect(proposal.tally.abstain).to.equal(0);

        await expect(plugin.connect(bob).vote(id, VoteOption.No, false))
          .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
          .withArgs(id, bob.address, VoteOption.No, 10);

        proposal = await plugin.getProposal(id);
        expect(proposal.tally.no).to.equal(10);
        expect(proposal.tally.no).to.equal(10);
        expect(proposal.tally.abstain).to.equal(0);

        await expect(plugin.connect(carol).vote(id, VoteOption.Abstain, false))
          .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
          .withArgs(id, carol.address, VoteOption.Abstain, 10);

        proposal = await plugin.getProposal(id);
        expect(proposal.tally.yes).to.equal(10);
        expect(proposal.tally.no).to.equal(10);
        expect(proposal.tally.abstain).to.equal(10);
      });

      it('reverts on voting None', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        // Check that voting is possible but don't vote using `callStatic`
        await expect(
          plugin.connect(alice).callStatic.vote(id, VoteOption.Yes, false)
        ).not.to.be.reverted;

        await expect(plugin.connect(alice).vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.None);
      });
    }

    describe('Standard', async () => {
      type LocalFixtureResult = {
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
        defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
        token: TestGovernanceERC20;
        dao: DAO;
        dummyActions: DAOStructs.ActionStruct[];
        dummyMetadata: string;
      };

      async function localFixture(): Promise<LocalFixtureResult> {
        const {
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
          token,
          dao,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        // Set voter balances
        const amount = 10;
        const promises = [
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
        ].map(signer => token.setBalance(signer.address, amount));
        await Promise.all(promises);

        // Update Voting settings
        const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.Standard,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(25),
          minDuration: TIME.HOUR,
          minProposerVotingPower: 0,
        };

        await initializedPlugin
          .connect(deployer)
          .updateVotingSettings(newVotingSettings);

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
          defaultVotingSettings: newVotingSettings,
          token,
          dao,
          dummyActions,
          dummyMetadata,
        };
      }

      baseTests(localFixture);

      it('reverts on vote replacement', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await plugin.connect(alice).vote(id, VoteOption.Yes, false);

        // Try to replace the vote
        await expect(plugin.connect(alice).vote(id, VoteOption.Yes, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.Yes);
        await expect(plugin.connect(alice).vote(id, VoteOption.No, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.No);
        await expect(plugin.connect(alice).vote(id, VoteOption.Abstain, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.Abstain);
        await expect(plugin.connect(alice).vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.None);
      });

      it('cannot early execute', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave, eve, frank], // 60 votes
          no: [],
          abstain: [],
        });

        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('can execute normally if participation and support are met', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          grace,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol], // 30 votes
          no: [dave, eve], // 20 votes
          abstain: [frank, grace], // 20 votes
        });

        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(false);

        await time.increaseTo(endDate);

        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;

        expect(await plugin.canExecute(id)).to.equal(true);
      });

      it('does not execute early when voting with the `tryEarlyExecution` option', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          grace,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave], // 40 votes
          no: [],
          abstain: [],
        });

        expect(await plugin.canExecute(id)).to.equal(false);

        // `tryEarlyExecution` is turned on but the vote is not decided yet
        await plugin.connect(eve).vote(id, VoteOption.Yes, true);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);

        // `tryEarlyExecution` is turned off and the vote is decided
        await plugin.connect(frank).vote(id, VoteOption.Yes, false);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);

        // `tryEarlyExecution` is turned on and the vote is decided
        await plugin.connect(grace).vote(id, VoteOption.Yes, true);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('reverts if vote is not decided yet', async () => {
        const {
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await expect(plugin.execute(id))
          .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
          .withArgs(id);
      });
    });

    describe('Early Execution', async () => {
      type LocalFixtureResult = {
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
        defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
        token: TestGovernanceERC20;
        dao: DAO;
        dummyActions: DAOStructs.ActionStruct[];
        dummyMetadata: string;
      };

      async function localFixture(): Promise<LocalFixtureResult> {
        const {
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
          token,
          dao,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        // Set voter balances
        const amount = 10;
        const promises = [
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
        ].map(signer => token.setBalance(signer.address, amount));
        await Promise.all(promises);

        // Update Voting settings
        const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower: 0,
        };

        await initializedPlugin
          .connect(deployer)
          .updateVotingSettings(newVotingSettings);

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
          defaultVotingSettings: newVotingSettings,
          token,
          dao,
          dummyActions,
          dummyMetadata,
        };
      }

      baseTests(localFixture);

      it('reverts on vote replacement', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await plugin.connect(alice).vote(id, VoteOption.Yes, false);

        // Try to replace the vote
        await expect(plugin.connect(alice).vote(id, VoteOption.Yes, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.Yes);
        await expect(plugin.connect(alice).vote(id, VoteOption.No, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.No);
        await expect(plugin.connect(alice).vote(id, VoteOption.Abstain, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.Abstain);
        await expect(plugin.connect(alice).vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.None);
      });

      it('can execute early if participation is large enough', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave, eve], // 50 votes
          no: [],
          abstain: [],
        });

        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(false);

        await plugin.connect(frank).vote(id, VoteOption.Yes, false);
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);

        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);
      });

      it('can execute normally if participation is large enough', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          grace,
          harold,
          ivan,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave, eve], // 50 yes
          no: [frank, grace, harold], // 30 votes
          abstain: [ivan], // 10 votes
        });

        // closes the vote
        await time.increaseTo(endDate);

        //The vote is executable as support > 50%, participation > 20%, and the voting period is over
        expect(await plugin.canExecute(id)).to.equal(true);
      });

      it('cannot execute normally if participation is too low', async () => {
        const {
          alice,
          bob,
          carol,
          initializedPlugin: plugin,
          token,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await token.setBalance(bob.address, 5);
        await token.setBalance(carol.address, 1);
        await setTotalSupply(token, 100);

        await voteWithSigners(plugin, id, {
          yes: [alice], // 10 votes
          no: [bob], //  5 votes
          abstain: [carol], // 4 votes
        });

        // closes the vote
        await time.increaseTo(endDate);

        //The vote is not executable because the participation with 19% is still too low, despite a support of 67% and the voting period being over
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('executes the vote immediately when the vote is decided early and the tryEarlyExecution options is selected', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          grace,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave], // 40 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        // `tryEarlyExecution` is turned on but the vote is not decided yet
        await plugin.connect(eve).vote(id, VoteOption.Yes, true);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);

        // `tryEarlyExecution` is turned off and the vote is decided
        await plugin.connect(frank).vote(id, VoteOption.Yes, false);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(true);

        // `tryEarlyExecution` is turned on and the vote is decided
        const tx = await plugin.connect(grace).vote(id, VoteOption.Yes, true);
        {
          const event = await findEventTopicLog<ExecutedEvent>(
            tx,
            DAO__factory.createInterface(),
            IDAO_EVENTS.Executed
          );

          expect(event.args.actor).to.equal(plugin.address);
          expect(event.args.callId).to.equal(proposalIdToBytes32(id));
          expect(event.args.actions.length).to.equal(1);
          expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
          expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
          expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
          expect(event.args.execResults).to.deep.equal(['0x']);

          expect((await plugin.getProposal(id)).executed).to.equal(true);
        }

        // check for the `ProposalExecuted` event in the voting contract
        {
          const event = await findEvent<ProposalExecutedEvent>(
            tx,
            IPROPOSAL_EVENTS.ProposalExecuted
          );
          expect(event.args.proposalId).to.equal(id);
        }

        // calling execute again should fail
        await expect(plugin.execute(id))
          .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
          .withArgs(id);
      });

      it('reverts if vote is not decided yet', async () => {
        const {
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await expect(plugin.execute(id))
          .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
          .withArgs(id);
      });
    });

    describe('Vote Replacement', async () => {
      type LocalFixtureResult = {
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
        defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
        token: TestGovernanceERC20;
        dao: DAO;
        dummyActions: DAOStructs.ActionStruct[];
        dummyMetadata: string;
      };

      async function localFixture(): Promise<LocalFixtureResult> {
        const {
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
          token,
          dao,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        // Set voter balances
        const amount = 10;
        const promises = [
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
        ].map(signer => token.setBalance(signer.address, amount));
        await Promise.all(promises);

        // Update Voting settings
        const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.VoteReplacement,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(20),
          minDuration: TIME.HOUR,
          minProposerVotingPower: 0,
        };

        await initializedPlugin
          .connect(deployer)
          .updateVotingSettings(newVotingSettings);

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
          defaultVotingSettings: newVotingSettings,
          token,
          dao,
          dummyActions,
          dummyMetadata,
        };
      }

      baseTests(localFixture);

      it('should allow vote replacement but not double-count votes by the same address', async () => {
        const {
          alice,

          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await plugin.connect(alice).vote(id, VoteOption.Yes, false);
        await plugin.connect(alice).vote(id, VoteOption.Yes, false);
        expect((await plugin.getProposal(id)).tally.yes).to.equal(10);
        expect((await plugin.getProposal(id)).tally.no).to.equal(0);
        expect((await plugin.getProposal(id)).tally.abstain).to.equal(0);

        await plugin.connect(alice).vote(id, VoteOption.No, false);
        await plugin.connect(alice).vote(id, VoteOption.No, false);
        expect((await plugin.getProposal(id)).tally.yes).to.equal(0);
        expect((await plugin.getProposal(id)).tally.no).to.equal(10);
        expect((await plugin.getProposal(id)).tally.abstain).to.equal(0);

        await plugin.connect(alice).vote(id, VoteOption.Abstain, false);
        await plugin.connect(alice).vote(id, VoteOption.Abstain, false);
        expect((await plugin.getProposal(id)).tally.yes).to.equal(0);
        expect((await plugin.getProposal(id)).tally.no).to.equal(0);
        expect((await plugin.getProposal(id)).tally.abstain).to.equal(10);

        await expect(plugin.connect(alice).vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
          .withArgs(id, alice.address, VoteOption.None);
      });

      it('cannot early execute', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,

          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave, eve, frank], // 60 votes
          no: [],
          abstain: [],
        });

        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('can execute normally if participation and support are met', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          grace,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol], // 30 votes
          no: [dave, eve], // 20 votes
          abstain: [frank, grace], // 20 votes
        });

        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(false);

        await time.increaseTo(endDate);

        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;

        expect(await plugin.canExecute(id)).to.equal(true);
      });

      it('does not execute early when voting with the `tryEarlyExecution` option', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          grace,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave], // 40 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false); //

        // `tryEarlyExecution` is turned on but the vote is not decided yet
        await plugin.connect(eve).vote(id, VoteOption.Yes, true);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);

        // `tryEarlyExecution` is turned off and the vote is decided
        await plugin.connect(frank).vote(id, VoteOption.Yes, false);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);

        // `tryEarlyExecution` is turned on and the vote is decided
        await plugin.connect(grace).vote(id, VoteOption.Yes, true);
        expect((await plugin.getProposal(id)).executed).to.equal(false);
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('reverts if vote is not decided yet', async () => {
        const {
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await expect(plugin.execute(id))
          .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
          .withArgs(id);
      });
    });
  });

  describe('Different configurations:', async () => {
    describe('A simple majority vote with >50% support and >=25% participation required', async () => {
      type LocalFixtureResult = {
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
        defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
        token: TestGovernanceERC20;
        dao: DAO;
        dummyActions: DAOStructs.ActionStruct[];
        dummyMetadata: string;
      };
      async function localFixture(): Promise<LocalFixtureResult> {
        const {
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
          token,
          dao,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        // Set voter balances
        const amount = 10;
        const promises = [
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
        ].map(signer => token.setBalance(signer.address, amount));
        await Promise.all(promises);

        // Update Voting settings
        const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(50),
          minParticipation: pctToRatio(25),
          minDuration: TIME.HOUR,
          minProposerVotingPower: 0,
        };

        await initializedPlugin
          .connect(deployer)
          .updateVotingSettings(newVotingSettings);

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
          defaultVotingSettings: newVotingSettings,
          token,
          dao,
          dummyActions,
          dummyMetadata,
        };
      }

      it('does not execute if support is high enough but participation is too low', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);

        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await plugin.connect(alice).vote(id, VoteOption.Yes, false);

        expect(await plugin.isMinParticipationReached(id)).to.be.false;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;

        expect(await plugin.canExecute(id)).to.equal(false);

        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.false;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('does not execute if participation is high enough but support is too low', async () => {
        const {
          alice,
          bob,
          carol,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);
        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice], // 10 votes
          no: [bob, carol], //  20 votes
          abstain: [], // 0 votes
        });

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.canExecute(id)).to.equal(false);

        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.false;
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('executes after the duration if participation and support are met', async () => {
        const {
          alice,
          bob,
          carol,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);
        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol], // 30 votes
          no: [], //  0 votes
          abstain: [], // 0 votes
        });

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.canExecute(id)).to.equal(false);

        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);
      });

      it('executes early if participation and support are met and the vote outcome cannot change anymore', async () => {
        const {
          alice,
          bob,
          carol,
          dave,
          eve,
          frank,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);
        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await voteWithSigners(plugin, id, {
          yes: [alice, bob, carol, dave, eve], // 50 votes
          no: [], //  0 votes
          abstain: [], // 0 votes
        });

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.canExecute(id)).to.equal(false);

        await plugin.connect(frank).vote(id, VoteOption.Yes, false);
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);

        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);
      });
    });

    describe('An edge case with `supportThreshold = 0%`, `minParticipation = 0%`, in early execution mode', async () => {
      type LocalFixtureResult = {
        deployer: SignerWithAddress;
        alice: SignerWithAddress;
        initializedPlugin: TokenVoting;
        defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
        token: TestGovernanceERC20;
        dao: DAO;
        dummyActions: DAOStructs.ActionStruct[];
        dummyMetadata: string;
      };
      async function localFixture(): Promise<LocalFixtureResult> {
        const {
          deployer,
          alice,
          initializedPlugin,
          token,
          dao,
          dummyActions,
          dummyMetadata,
        } = await loadFixture(globalFixture);

        // Set Alice's balance to 1% of the total supply.
        await token.setBalance(alice.address, 1);
        await setTotalSupply(token, 100);

        // Update Voting settings
        const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(0), // The lowest possible value
          minParticipation: pctToRatio(0), // The lowest possible value
          minDuration: TIME.HOUR,
          minProposerVotingPower: 0,
        };

        await initializedPlugin
          .connect(deployer)
          .updateVotingSettings(newVotingSettings);

        return {
          deployer,
          alice,
          initializedPlugin,
          defaultVotingSettings: newVotingSettings,
          token,
          dao,
          dummyActions,
          dummyMetadata,
        };
      }

      it('does not execute with 0 votes', async () => {
        const {
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);
        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        // does not execute early
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.canExecute(id)).to.equal(false);

        // does not execute normally
        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.false;
        expect(await plugin.canExecute(id)).to.equal(false);
      });

      it('executes if participation and support are met', async () => {
        const {
          alice,
          initializedPlugin: plugin,
          dummyMetadata,
          dummyActions,
        } = await loadFixture(localFixture);
        const endDate = (await time.latest()) + TIME.DAY;

        await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          VoteOption.None,
          false
        );
        const id = 0;

        await plugin.connect(alice).vote(id, VoteOption.Yes, false);

        // Check if the proposal can execute early
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);

        // Check if the proposal can execute normally
        await time.increaseTo(endDate);

        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.equal(true);
      });
    });

    describe('An edge case with `supportThreshold = 99.9999%` and `minParticipation = 100%` in early execution mode', async () => {
      describe('token balances are in the magnitude of 10^18', async () => {
        type LocalFixtureResult = {
          deployer: SignerWithAddress;
          alice: SignerWithAddress;
          bob: SignerWithAddress;
          carol: SignerWithAddress;
          initializedPlugin: TokenVoting;
          defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
          token: TestGovernanceERC20;
          dao: DAO;
          dummyActions: DAOStructs.ActionStruct[];
          dummyMetadata: string;
        };

        async function localFixture(): Promise<LocalFixtureResult> {
          const {
            deployer,
            alice,
            bob,
            carol,
            initializedPlugin,
            token,
            dao,
            dummyActions,
            dummyMetadata,
          } = await loadFixture(globalFixture);

          // Set the balances of alice, bob, and carol.
          const totalSupply = ethers.BigNumber.from(10).pow(18);
          const delta = totalSupply.div(RATIO_BASE);
          await setBalances(token, [
            {
              receiver: alice.address,
              amount: totalSupply.sub(delta), // 99.9999% of the total supply
            },
            {receiver: bob.address, amount: 1}, // 1 vote (10^-16 % = 0.0000000000000001%)
            {receiver: carol.address, amount: delta.sub(1)}, // 1 vote less than 0.0001% of the total supply (99.9999% - 10^-16% = 0.00009999999999999%)
          ]);

          // Update Voting settings
          const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
            votingMode: VotingMode.EarlyExecution,
            supportThreshold: pctToRatio(100).sub(1), // the largest possible value
            minParticipation: pctToRatio(100), // the largest possible value
            minDuration: TIME.HOUR,
            minProposerVotingPower: 0,
          };

          await initializedPlugin
            .connect(deployer)
            .updateVotingSettings(newVotingSettings);

          return {
            deployer,
            alice,
            bob,
            carol,
            initializedPlugin,
            defaultVotingSettings: newVotingSettings,
            token,
            dao,
            dummyActions,
            dummyMetadata,
          };
        }

        it('early support criterion is sharp by 1 vote', async () => {
          const {
            alice,
            bob,
            carol,
            initializedPlugin: plugin,
            dummyMetadata,
            dummyActions,
          } = await loadFixture(localFixture);
          const endDate = (await time.latest()) + TIME.DAY;

          await plugin.createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );
          const id = 0;

          // 99.9999% of the voting power voted for yes
          await plugin.connect(alice).vote(id, VoteOption.Yes, false);
          expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
          expect(await plugin.isSupportThresholdReached(id)).to.be.true;

          // 1 vote is still missing to meet >99.9999% worst case support
          const proposal = await plugin.getProposal(id);
          const tally = proposal.tally;
          const totalVotingPower = await plugin.totalVotingPower(
            proposal.parameters.snapshotBlock
          );
          expect(
            totalVotingPower.sub(tally.yes).sub(tally.abstain) // this is the number of worst case no votes
          ).to.eq(totalVotingPower.div(RATIO_BASE));

          // vote with 1 more yes vote
          await plugin.connect(bob).vote(id, VoteOption.Yes, false);
          expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
          expect(await plugin.isSupportThresholdReached(id)).to.be.true;

          // voting with the remaining votes does not change this
          await plugin.connect(carol).vote(id, VoteOption.Yes, false);
          expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
          expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        });

        it('participation criterion is sharp by 1 vote', async () => {
          const {
            alice,
            bob,
            carol,
            initializedPlugin: plugin,
            dummyMetadata,
            dummyActions,
          } = await loadFixture(localFixture);
          const endDate = (await time.latest()) + TIME.DAY;

          await plugin.createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );
          const id = 0;

          await plugin.connect(alice).vote(id, VoteOption.Yes, false);
          await plugin.connect(carol).vote(id, VoteOption.Yes, false);

          // 1 vote is still missing to meet particpiation = 100%
          const proposal = await plugin.getProposal(id);
          const tally = proposal.tally;
          const totalVotingPower = await plugin.totalVotingPower(
            proposal.parameters.snapshotBlock
          );
          expect(
            totalVotingPower.sub(tally.yes).sub(tally.no).sub(tally.abstain)
          ).to.eq(1);
          expect(await plugin.isMinParticipationReached(id)).to.be.false;

          // cast the last vote so that participation = 100%
          await plugin.connect(bob).vote(id, VoteOption.Yes, false);
          expect(await plugin.isMinParticipationReached(id)).to.be.true;
        });
      });

      describe('tokens balances are in the magnitude of 10^6', async () => {
        type LocalFixtureResult = {
          deployer: SignerWithAddress;
          alice: SignerWithAddress;
          bob: SignerWithAddress;
          initializedPlugin: TokenVoting;
          defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
          token: TestGovernanceERC20;
          dao: DAO;
          dummyActions: DAOStructs.ActionStruct[];
          dummyMetadata: string;
        };

        async function localFixture(): Promise<LocalFixtureResult> {
          const {
            deployer,
            alice,
            bob,
            initializedPlugin,
            token,
            dao,
            dummyActions,
            dummyMetadata,
          } = await loadFixture(globalFixture);

          // Set the balances of alice and bob.
          const totalSupply = ethers.BigNumber.from(10).pow(6);
          const delta = 1; // 0.0001% of the total supply

          await setBalances(token, [
            {receiver: alice.address, amount: totalSupply.sub(delta)}, // 99.9999%
            {receiver: bob.address, amount: delta}, //             0.0001%
          ]);

          // Update Voting settings
          const newVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
            votingMode: VotingMode.EarlyExecution,
            supportThreshold: pctToRatio(100).sub(1), // the largest possible value
            minParticipation: pctToRatio(100), // the largest possible value
            minDuration: TIME.HOUR,
            minProposerVotingPower: 0,
          };

          await initializedPlugin
            .connect(deployer)
            .updateVotingSettings(newVotingSettings);

          return {
            deployer,
            alice,
            bob,
            initializedPlugin,
            defaultVotingSettings: newVotingSettings,
            token,
            dao,
            dummyActions,
            dummyMetadata,
          };
        }

        it('early support criterion is sharp by 1 vote', async () => {
          const {
            alice,
            bob,
            initializedPlugin: plugin,
            dummyMetadata,
            dummyActions,
          } = await loadFixture(localFixture);
          const endDate = (await time.latest()) + TIME.DAY;

          await plugin.createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );
          const id = 0;

          await plugin.connect(alice).vote(id, VoteOption.Yes, false);

          // 1 vote is still missing to meet >99.9999%
          const proposal = await plugin.getProposal(id);
          const tally = proposal.tally;
          const totalVotingPower = await plugin.totalVotingPower(
            proposal.parameters.snapshotBlock
          );
          expect(
            totalVotingPower.sub(tally.yes).sub(tally.abstain) // this is the number of worst case no votes
          ).to.eq(totalVotingPower.div(RATIO_BASE));

          expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
          expect(await plugin.isSupportThresholdReached(id)).to.be.true;

          // cast the last vote so that support = 100%
          await plugin.connect(bob).vote(id, VoteOption.Yes, false);
          expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
          expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        });

        it('participation is not met with 1 vote missing', async () => {
          const {
            alice,
            bob,
            initializedPlugin: plugin,
            dummyMetadata,
            dummyActions,
          } = await loadFixture(localFixture);
          const endDate = (await time.latest()) + TIME.DAY;

          await plugin.createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            endDate,
            VoteOption.None,
            false
          );
          const id = 0;

          await plugin.connect(alice).vote(id, VoteOption.Yes, false);
          expect(await plugin.isMinParticipationReached(id)).to.be.false;

          // 1 vote is still missing to meet particpiation = 100%
          const proposal = await plugin.getProposal(id);
          const tally = proposal.tally;
          const totalVotingPower = await plugin.totalVotingPower(
            proposal.parameters.snapshotBlock
          );
          expect(
            totalVotingPower.sub(tally.yes).sub(tally.no).sub(tally.abstain)
          ).to.eq(1);
          expect(await plugin.isMinParticipationReached(id)).to.be.false;

          // cast the last vote so that participation = 100%
          await plugin.connect(bob).vote(id, VoteOption.Yes, false);
          expect(await plugin.isMinParticipationReached(id)).to.be.true;
        });
      });
    });

    describe('Execution criteria handle token balances for multiple orders of magnitude', async function () {
      const powers = [0, 1, 2, 3, 6, 12, 18, 24, 36, 48];

      powers.forEach(async power => {
        it(`magnitudes of 10^${power}`, async function () {
          const {
            alice,
            bob,
            initializedPlugin: plugin,
            token,
            dummyMetadata,
            dummyActions,
          } = await loadFixture(globalFixture);

          const magnitude = BigNumber.from(10).pow(power);

          const oneToken = magnitude;
          const balances = [
            {
              receiver: alice.address,
              amount: oneToken.mul(5).add(1),
            },
            {
              receiver: bob.address,
              amount: oneToken.mul(5),
            },
          ];

          // signer[0] has more voting power than signer[1]
          const balanceDifference = balances[0].amount.sub(balances[1].amount);
          expect(balanceDifference).to.eq(1);

          await setBalances(token, balances);

          await plugin.createProposal(
            dummyMetadata,
            dummyActions,
            0,
            0,
            0,
            VoteOption.None,
            false
          );
          const id = 0;

          const snapshotBlock = (await plugin.getProposal(id)).parameters
            .snapshotBlock;
          const totalVotingPower = await plugin.totalVotingPower(snapshotBlock);
          expect(totalVotingPower).to.eq(
            balances[0].amount.add(balances[1].amount)
          );

          // vote with both signers
          await plugin.connect(alice).vote(id, VoteOption.Yes, false);
          await plugin.connect(bob).vote(id, VoteOption.No, false);

          expect(await plugin.isSupportThresholdReached(id)).to.be.true;
          expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
          expect(await plugin.isMinParticipationReached(id)).to.be.true;
          expect(await plugin.canExecute(id)).to.be.true;
        });
      });
    });
  });
});
