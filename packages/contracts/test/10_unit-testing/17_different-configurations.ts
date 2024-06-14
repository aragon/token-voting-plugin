import {TestGovernanceERC20} from '../../typechain';
import {ITokenVoting as MajorityVotingBase} from '../../typechain';
import {GlobalFixtureResult, globalFixture} from '../test-utils/fixture';
import {TokenVoting} from '../test-utils/typechain-versions';
import {
  VotingMode,
  voteWithSigners,
  setBalances,
  setTotalSupply,
  Tally,
  getProposalIdFromTx,
} from '../test-utils/voting-helpers';
import {TIME, pctToRatio, RATIO_BASE} from '@aragon/osx-commons-sdk';
import {DAO, DAOStructs} from '@aragon/osx-ethers';
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber, BigNumberish} from 'ethers';
import {ethers} from 'hardhat';

describe('Different configurations:', async () => {
  describe('A simple majority vote with >50% support and >=25% participation required', async () => {
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

      await plugin.connect(alice).vote(id, Tally.yes(10), false);

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

      await voteWithSigners(plugin, id, {
        yes: [alice, bob, carol, dave, eve], // 50 votes
        no: [], //  0 votes
        abstain: [], // 0 votes
      });

      expect(await plugin.isMinParticipationReached(id)).to.be.true;
      expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
      expect(await plugin.canExecute(id)).to.equal(false);

      await plugin.connect(frank).vote(id, Tally.yes(10), false);
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

      await plugin.connect(alice).vote(id, Tally.yes(1), false);

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
        balances: {[key: string]: BigNumberish};
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
        const delta = totalSupply.div(RATIO_BASE); // 10^6
        const balances = {
          alice: totalSupply.sub(delta), // 99.9999% of the total supply
          bob: 1, // 1 vote (10^-16 % = 0.0000000000000001%)
          carol: delta.sub(1), // 1 vote less than 0.0001% of the total supply (99.9999% - 10^-16% = 0.00009999999999999%)
        };
        await setBalances(token, [
          {
            receiver: alice.address,
            amount: balances.alice, // 99.9999% of the total supply
          },
          {receiver: bob.address, amount: balances.bob}, // 1 vote (10^-16 % = 0.0000000000000001%)
          {receiver: carol.address, amount: balances.carol}, // 1 vote less than 0.0001% of the total supply (99.9999% - 10^-16% = 0.00009999999999999%)
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
          balances,
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
          balances,
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

        // Vote `Yes` with Alice who has 99.9999% of the voting power.
        await plugin.connect(alice).vote(id, Tally.yes(balances.alice), false);

        // Check that the `supportThreshold` is not met early yet (because if Bob votes `No` with his remaining 1 vote, the support threshold is not met).
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.false;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;

        // Check that only 1 vote is missing to meet >99.9999% worst case support
        const proposal = await plugin.getProposal(id);
        const tally = proposal.tally;
        const totalVotingPower = await plugin.totalVotingPower(
          proposal.parameters.snapshotBlock
        );
        expect(
          totalVotingPower.sub(tally.yes).sub(tally.abstain) // this is the number of worst case no votes
        ).to.eq(totalVotingPower.div(RATIO_BASE));

        // Vote `Yes` with Bob who has 1 vote.
        await plugin.connect(bob).vote(id, Tally.yes(balances.bob), false);

        // Check that the `supportThreshold` is now met early.
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;

        // Check that Carol voting with the remaining votes does not change the vote outcome.
        await plugin.connect(carol).vote(id, Tally.yes(balances.carol), false);
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
      });

      it('participation criterion is sharp by 1 vote', async () => {
        const {
          balances,
          alice,
          bob,
          carol,
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

        //Vote `Yes` with Alice who has 99.9999% of the total supply.
        await plugin.connect(alice).vote(id, Tally.yes(balances.alice), false);
        // Vote `yes` with Carol who has close to 0.0001% of the total supply (only 1 vote is missing that Bob has).
        await plugin.connect(carol).vote(id, Tally.yes(balances.carol), false);

        // Check that only 1 vote is missing to meet 100% particpiation.
        const proposal = await plugin.getProposal(id);
        const tally = proposal.tally;
        const totalVotingPower = await plugin.totalVotingPower(
          proposal.parameters.snapshotBlock
        );
        expect(
          totalVotingPower.sub(tally.yes).sub(tally.no).sub(tally.abstain)
        ).to.eq(1);
        expect(await plugin.isMinParticipationReached(id)).to.be.false;

        // Cast the last vote as Bob so that 100% participation is met.
        await plugin.connect(bob).vote(id, Tally.yes(balances.bob), false);
        // Check that the `minParticipation` value is now reached.
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
      });
    });

    describe('tokens balances are in the magnitude of 10^6', async () => {
      type LocalFixtureResult = {
        balances: {[key: string]: BigNumberish};
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

        const balances = {
          alice: totalSupply.sub(delta), // 99.9999%
          bob: delta, // 0.0001%
        };

        await setBalances(token, [
          {receiver: alice.address, amount: balances.alice},
          {receiver: bob.address, amount: balances.bob},
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
          balances,
        };
      }

      it('early support criterion is sharp by 1 vote', async () => {
        const {
          balances,
          alice,
          bob,
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

        await plugin.connect(alice).vote(id, Tally.yes(balances.alice), false);

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
        await plugin.connect(bob).vote(id, Tally.yes(balances.bob), false);
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
      });

      it('participation is not met with 1 vote missing', async () => {
        const {
          balances,
          alice,
          bob,
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

        await plugin.connect(alice).vote(id, Tally.yes(balances.alice), false);
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
        await plugin.connect(bob).vote(id, Tally.yes(balances.bob), false);
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
      });
    });
  });

  describe('Execution criteria handle token balances for multiple orders of magnitude', async function () {
    const powers = [0, 1, 2, 3, 6, 12, 18, 24, 36, 48, 60, 66];
    // ~10^67 is the biggest total supply possible.
    // => Log10[2^224] ~ 67.4307 (OZ ERC20VotesUpgradeable checkpoints are stored in `uint224`).

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

        // Set the balances of Alice and Bob.
        const baseUnit = BigNumber.from(10).pow(power);
        await setBalances(token, [
          {
            receiver: alice.address,
            amount: baseUnit.mul(5).add(1),
          },
          {
            receiver: bob.address,
            amount: baseUnit.mul(5),
          },
        ]);
        const balanceAlice = await token.balanceOf(alice.address);
        const balanceBob = await token.balanceOf(bob.address);

        // Check that Alice has one more vote than Bob.
        expect(balanceAlice.sub(balanceBob)).to.eq(1);

        // Create a proposal.
        const tx = await plugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          0,
          Tally.empty(),
          false
        );
        const id = await getProposalIdFromTx(plugin, tx);

        // Check that Alice and Bob's balances add up to the total voting power.
        const snapshotBlock = (await plugin.getProposal(id)).parameters
          .snapshotBlock;
        const totalVotingPower = await plugin.totalVotingPower(snapshotBlock);
        expect(totalVotingPower).to.eq(balanceAlice.add(balanceBob));

        // Vote `Yes` with Alice.
        await plugin.connect(alice).vote(id, Tally.yes(balanceAlice), false);
        // Vote `No` with Bob.
        await plugin.connect(bob).vote(id, Tally.no(balanceBob), false);

        // Check that the vote has passed (since Alice has one more vote than Bob).
        expect(await plugin.isSupportThresholdReached(id)).to.be.true;
        expect(await plugin.isSupportThresholdReachedEarly(id)).to.be.true;
        expect(await plugin.isMinParticipationReached(id)).to.be.true;
        expect(await plugin.canExecute(id)).to.be.true;
      });
    });
  });
});
