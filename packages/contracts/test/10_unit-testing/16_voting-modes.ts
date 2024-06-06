import {TestGovernanceERC20} from '../../typechain';
import {ITokenVoting} from '../../typechain';
import {ProposalExecutedEvent} from '../../typechain/src/TokenVoting';
import {ExecutedEvent} from '../../typechain/src/mocks/DAOMock';
import {GlobalFixtureResult, globalFixture} from '../test-utils/fixture';
import {VOTING_EVENTS} from '../test-utils/majority-voting-constants';
import {TokenVoting} from '../test-utils/typechain-versions';
import {
  VotingMode,
  voteWithSigners,
  setTotalSupply,
  Tally,
  getProposalIdFromTx,
} from '../test-utils/voting-helpers';
import {
  findEvent,
  findEventTopicLog,
  proposalIdToBytes32,
  TIME,
  pctToRatio,
} from '@aragon/osx-commons-sdk';
import {DAO, DAOStructs, DAO__factory} from '@aragon/osx-ethers';
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';

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
      defaultVotingSettings: ITokenVoting.VotingSettingsStruct;
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

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        startDate,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      await expect(plugin.connect(alice).vote(id, Tally.yes(1), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.yes(1).toArray());
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

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // check the mallory has 0 token
      expect(await token.balanceOf(mallory.address)).to.equal(0);

      await expect(plugin.connect(mallory).vote(id, Tally.yes(1), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, mallory.address, Tally.yes(1).toArray());
    });

    it('increases the yes, no, and abstain count and emits correct events', async () => {
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

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with Alice.
      await expect(plugin.connect(alice).vote(id, Tally.yes(10), false))
        .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, alice.address, Tally.yes(10).toArray(), 10);

      let proposal = await plugin.getProposal(id);
      expect(proposal.tally.yes).to.equal(10);
      expect(proposal.tally.no).to.equal(0);
      expect(proposal.tally.abstain).to.equal(0);

      // Vote with Bob.
      await expect(plugin.connect(bob).vote(id, Tally.no(10), false))
        .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, bob.address, Tally.no(10).toArray(), 10);

      proposal = await plugin.getProposal(id);
      expect(proposal.tally.yes).to.equal(10);
      expect(proposal.tally.no).to.equal(10);
      expect(proposal.tally.abstain).to.equal(0);

      // Vote with Carol.
      await expect(plugin.connect(carol).vote(id, Tally.abstain(10), false))
        .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, carol.address, Tally.abstain(10).toArray(), 10);

      proposal = await plugin.getProposal(id);
      expect(proposal.tally.yes).to.equal(10);
      expect(proposal.tally.no).to.equal(10);
      expect(proposal.tally.abstain).to.equal(10);

      // Vote once more with Dave, Eve, and Frank.
      await plugin.connect(dave).vote(id, Tally.yes(5), false);
      await plugin.connect(eve).vote(id, Tally.no(5), false);
      await plugin.connect(frank).vote(id, Tally.abstain(5), false);

      proposal = await plugin.getProposal(id);
      expect(proposal.tally.yes).to.equal(15);
      expect(proposal.tally.no).to.equal(15);
      expect(proposal.tally.abstain).to.equal(15);
    });

    it('reverts on voting None', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        dummyMetadata,
        dummyActions,
      } = await loadFixture(localFixture);

      const endDate = (await time.latest()) + TIME.DAY;

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Check that voting is possible but don't vote using `callStatic`
      await expect(
        plugin.connect(alice).callStatic.vote(id, Tally.yes(10), false)
      ).not.to.be.reverted;

      await expect(plugin.connect(alice).vote(id, Tally.empty(), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.empty().toArray());
    });
  }

  describe('Standard', async () => {
    type LocalFixtureResult = Omit<GlobalFixtureResult, 'uninitializedPlugin'>;

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
      const newVotingSettings: ITokenVoting.VotingSettingsStruct = {
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

      // Create a proposal.
      const tx = await plugin
        .connect(alice)
        .createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          endDate,
          Tally.empty(),
          false
        );
      const id = getProposalIdFromTx(plugin, tx);

      // Vote as Alice.
      await plugin.connect(alice).vote(id, Tally.yes(1).toStruct(), false);

      console.warn('\x1b[31m%s\x1b[0m', 'TODO: Fix Custom Error');
      // Try to replace the vote as Alice, which must revert.
      await expect(
        plugin.connect(alice).vote(id, Tally.yes(1).toStruct(), false)
      ).to.be.revertedWithCustomError(plugin, 'VoteCastForbidden');
      // .withArgs(id, alice.address, alice.address);
      await expect(
        plugin.connect(alice).vote(id, Tally.no(1), false)
      ).to.be.revertedWithCustomError(plugin, 'VoteCastForbidden');
      //   .withArgs(id, alice.address, Tally.no(1));
      await expect(
        plugin.connect(alice).vote(id, Tally.abstain(1), false)
      ).to.be.revertedWithCustomError(plugin, 'VoteCastForbidden');
      //   .withArgs(id, alice.address, Tally.abstain(1));
      await expect(
        plugin.connect(alice).vote(id, Tally.empty(), false)
      ).to.be.revertedWithCustomError(plugin, 'VoteCastForbidden');
      //   .withArgs(id, alice.address, Tally.empty());
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

      // Create a proposal.
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough voters so that the execution criteria are met.
      // Vote with enough votes so that the execution criteria and the vote outcome cannot change anymore,
      // even with more people voting.
      // Since there a 60 yes votes, even if all remaining votes are casted for `No`, this cannot result in a
      // `supportThreshold` below 50%.
      await voteWithSigners(
        plugin,
        id,
        {
          yes: [alice, bob, carol, dave, eve, frank], // 60 votes
          no: [],
          abstain: [],
        },
        10
      );

      // Expect the vote to be non-executable since the voting mode is `Standard` and early execution is not possible.
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

      // Create a proposal.
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough voters so that the execution criteria are met.
      await voteWithSigners(
        plugin,
        id,
        {
          yes: [alice, bob, carol], // 30 votes
          no: [dave, eve], // 20 votes
          abstain: [frank, grace], // 20 votes
        },
        10
      );

      expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
      expect(await plugin.isMinParticipationReached(id)).to.be.true;
      expect(await plugin.canExecute(id)).to.equal(false);

      // Wait until the vote is over.
      await time.increaseTo(endDate);

      // Check that the proposal can be executed.
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

      // Create a proposal.
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough voters so that the execution criteria are met.
      await voteWithSigners(
        plugin,
        id,
        {
          yes: [alice, bob, carol, dave], // 40 votes
          no: [],
          abstain: [],
        },
        10
      );

      // Check that the proposal cannot be executed.
      expect(await plugin.canExecute(id)).to.equal(false);

      // `tryEarlyExecution` is turned on but the vote is not decided yet.
      await plugin.connect(eve).vote(id, Tally.yes(1), true);
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false);

      // Vote `Yes` with `tryEarlyExecution` being turned off and the vote being decided already.
      // Check that the vote still cannot be executed.
      await plugin.connect(frank).vote(id, Tally.yes(1), false);
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false);

      // Vote yes with `tryEarlyExecution` being turned on and the vote being decided already.
      // Check that the vote still cannot be executed..
      await plugin.connect(grace).vote(id, Tally.yes(1), true);
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

      // Create a proposal.
      await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = 0;

      // Try to execute it while the vote is not decided yet.
      await expect(plugin.execute(id))
        .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
        .withArgs(id);
    });
  });

  describe('Early Execution', async () => {
    type LocalFixtureResult = Omit<GlobalFixtureResult, 'uninitializedPlugin'>;

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
      const newVotingSettings: ITokenVoting.VotingSettingsStruct = {
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

      // Create a proposal
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with Alice.
      await plugin.connect(alice).vote(id, Tally.yes(1), false);

      // Try to replace the vote as Alice, which should revert regardless of the new vote option.
      await expect(plugin.connect(alice).vote(id, Tally.yes(1), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.yes(1).toArray());
      await expect(plugin.connect(alice).vote(id, Tally.no(1), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.no(1).toArray());
      await expect(plugin.connect(alice).vote(id, Tally.abstain(1), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.abstain(1).toArray());
      await expect(plugin.connect(alice).vote(id, Tally.empty(), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.empty().toArray());
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

      // Create a Proposal
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough votes so that the vote is almost already decided.
      // If the remaining 50 votes become `No`s, the proposal would be defeated because the support threshold wouldn't be exceeded.
      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol, dave, eve], // 50 votes
        no: [],
        abstain: [],
      });

      // Check that the vote cannot be (early) executed.
      expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
      expect(await plugin.isMinParticipationReached(id)).to.be.true;
      expect(await plugin.canExecute(id)).to.equal(false);

      // Vote with Frank so that the vote is decided even if all remaining people vote `No`.
      await plugin.connect(frank).vote(id, Tally.yes(1), false);

      // Check that the proposal can be early executed before the end date.
      expect(await plugin.isMinParticipationReached(id)).to.be.true;
      expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
      expect(await plugin.canExecute(id)).to.equal(true);

      // Advance time after the end date.
      await time.increaseTo(endDate);

      // Check that the proposal can still be executed.
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

      // Create a proposal.
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough people so that execution criteria are met.
      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol, dave, eve], // 50 yes
        no: [frank, grace, harold], // 30 votes
        abstain: [ivan], // 10 votes
      });

      // Advance after the end date.
      await time.increaseTo(endDate);

      // Check that the vote is executable because support > 50%, participation > 20%, and the voting period is over.
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

      // Create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Set Bob's and Carol's balances.
      await token.setBalance(bob.address, 5);
      await token.setBalance(carol.address, 4);
      await setTotalSupply(token, 100);

      // Vote such that the support threshold is is met but minimal participation is not reached.
      await voteWithSigners(
        plugin,
        id,
        {
          yes: [alice], // 10 votes
          no: [bob], //  5 votes
          abstain: [carol], // 4 votes
        },
        [10, 5, 4]
      );

      // Advance time after the end date.
      await time.increaseTo(endDate);

      // Check that the vote is not executable because the participation with 19% is still too low, despite a support of 67% and the voting period being over.
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

      // Create a Proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      let tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote 40 votes for `Yes`. The proposal can still get defeated if the remaining 60 votes vote for `No`.
      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol, dave], // 40 votes
        no: [], // 0 votes
        abstain: [], // 0 votes
      });

      // Vote `Yes` with Eve with `tryEarlyExecution` being turned on. The vote is not decided yet.
      await plugin.connect(eve).vote(id, Tally.yes(10), true);
      // Check that the proposal cannot be early executed and didn't execute yet.
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false);

      // Vote `Yes` with Frank with `tryEarlyExecution` being turned off. The vote is decided now.
      await plugin.connect(frank).vote(id, Tally.yes(10), false);
      // Check that the proposal can be excuted but didn't execute yet.
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(true);

      // Vote `Yes` with grace with `tryEarlyExecution` being turned on while the vote is decided.
      tx = await plugin.connect(grace).vote(id, Tally.yes(10), true);
      // Check that this executes the vote as expected.
      {
        const event = findEventTopicLog<ExecutedEvent>(
          await tx.wait(),
          DAO__factory.createInterface(),
          'Executed'
        );

        expect(event.args.actor).to.equal(plugin.address);
        expect(event.args.callId).to.equal(id.toHexString());
        expect(event.args.actions.length).to.equal(1);
        expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
        expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
        expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
        expect(event.args.execResults).to.deep.equal(['0x']);

        expect((await plugin.getProposal(id)).executed).to.equal(true);
      }

      // check for the `ProposalExecuted` event in the voting contract
      {
        const event = findEvent<ProposalExecutedEvent>(
          await tx.wait(),
          'ProposalExecuted'
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

      // Create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Check that it cannot be executed because it is not decided yet.
      await expect(plugin.execute(id))
        .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
        .withArgs(id);
    });
  });

  describe('Vote Replacement', async () => {
    type LocalFixtureResult = Omit<GlobalFixtureResult, 'uninitializedPlugin'>;

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
      const newVotingSettings: ITokenVoting.VotingSettingsStruct = {
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

      // Create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote two times for `Yes` as Alice.
      await plugin.connect(alice).vote(id, Tally.yes(10), false);
      await plugin.connect(alice).vote(id, Tally.yes(10), false);
      // Check that Alice's voting power is counted only once.
      expect((await plugin.getProposal(id)).tally.yes).to.equal(10);
      expect((await plugin.getProposal(id)).tally.no).to.equal(0);
      expect((await plugin.getProposal(id)).tally.abstain).to.equal(0);

      // Vote two times for `No` as Alice.
      await plugin.connect(alice).vote(id, Tally.no(10), false);
      await plugin.connect(alice).vote(id, Tally.no(10), false);
      // Check that Alice's voting power is counted only once.
      expect((await plugin.getProposal(id)).tally.yes).to.equal(0);
      expect((await plugin.getProposal(id)).tally.no).to.equal(10);
      expect((await plugin.getProposal(id)).tally.abstain).to.equal(0);

      // Vote two times for 'Abstain' as Alice.
      await plugin.connect(alice).vote(id, Tally.abstain(10), false);
      await plugin.connect(alice).vote(id, Tally.abstain(10), false);
      // Check that Alice's voting power is counted only once.
      expect((await plugin.getProposal(id)).tally.yes).to.equal(0);
      expect((await plugin.getProposal(id)).tally.no).to.equal(0);
      expect((await plugin.getProposal(id)).tally.abstain).to.equal(10);

      // Vote for 'None' as Alice to retract the vote.
      await expect(plugin.connect(alice).vote(id, Tally.empty(), false))
        .to.be.revertedWithCustomError(plugin, 'VoteCastForbidden')
        .withArgs(id, alice.address, Tally.empty().toArray());
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

      // Create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough votes so that the vote is already decided.
      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol, dave, eve, frank], // 60 votes
        no: [],
        abstain: [],
      });

      // Check that the proposal cannot be executed early.
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

      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote with enough votes so that the support threshold and minimal participation are met.
      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol], // 30 votes
        no: [dave, eve], // 20 votes
        abstain: [frank, grace], // 20 votes
      });

      // Check that the proposal cannot be executed early.
      expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
      expect(await plugin.isSupportThresholdReached(id)).to.be.true;
      expect(await plugin.isMinParticipationReached(id)).to.be.true;
      expect(await plugin.canExecute(id)).to.equal(false);

      // Advance time to the end date.
      await time.increaseTo(endDate);

      // Check that the proposal can be executed regularly.
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

      // Create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Vote 40 votes for `Yes`. The proposal can still get defeated if the remaining 60 votes vote for `No`.
      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol, dave], // 40 votes
        no: [], // 0 votes
        abstain: [], // 0 votes
      });

      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false); //

      // Vote `Yes` with Eve with `tryEarlyExecution` being turned on. The vote is not decided yet.
      await plugin.connect(eve).vote(id, Tally.yes(10), true);
      // Check that the proposal cannot be excuted.
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false);

      // Vote `Yes` with Frank with `tryEarlyExecution` being turned off. The vote is decided now.
      await plugin.connect(frank).vote(id, Tally.yes(10), false);
      // Check that the proposal cannot be excuted.
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false);

      // Vote `Yes` with Eve with `tryEarlyExecution` being turned on. The vote is not decided yet.
      await plugin.connect(grace).vote(id, Tally.yes(10), true);
      // Check that the proposal cannot be excuted.
      expect((await plugin.getProposal(id)).executed).to.equal(false);
      expect(await plugin.canExecute(id)).to.equal(false);
    });

    it('reverts if vote is not decided yet', async () => {
      const {
        initializedPlugin: plugin,
        dummyMetadata,
        dummyActions,
      } = await loadFixture(localFixture);

      // Create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
      const tx = await plugin.createProposal(
        dummyMetadata,
        dummyActions,
        0,
        0,
        endDate,
        Tally.empty(),
        false
      );
      const id = await getProposalIdFromTx(plugin, tx);

      // Check that it cannot be executed because the vote is not decided yet.
      await expect(plugin.execute(id))
        .to.be.revertedWithCustomError(plugin, 'ProposalExecutionForbidden')
        .withArgs(id);
    });
  });
});
