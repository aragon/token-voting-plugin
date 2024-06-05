import {ITokenVoting as MajorityVotingBase} from '../../typechain';
import {ProposalCreatedEvent} from '../../typechain/src/TokenVoting';
import {globalFixture} from '../test-utils/fixture';
import {VOTING_EVENTS} from '../test-utils/majority-voting-constants';
import {
  VoteOption,
  VotingMode,
  setBalances,
  setTotalSupply,
} from '../test-utils/voting-helpers';
import {findEvent, TIME, pctToRatio, RATIO_BASE} from '@aragon/osx-commons-sdk';
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {ethers} from 'hardhat';

describe('Proposal creation', async () => {
  let voteSettingsWithMinProposerVotingPower: MajorityVotingBase.VotingSettingsStruct;

  before(async () => {
    voteSettingsWithMinProposerVotingPower = {
      votingMode: VotingMode.EarlyExecution,
      supportThreshold: pctToRatio(50),
      minParticipation: pctToRatio(20),
      minDuration: TIME.HOUR,
      minProposerVotingPower: 123,
    };
  });

  describe('minProposerVotingPower == 0', async () => {
    it('creates a proposal if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block', async () => {
      const {
        alice,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      await setTotalSupply(token, 1);

      // Create a proposal with Alice despite her having no voting power.
      const endDate = (await time.latest()) + TIME.DAY;
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
      const event = findEvent<ProposalCreatedEvent>(
        await tx.wait(),
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

      await plugin
        .connect(deployer)
        .updateVotingSettings(voteSettingsWithMinProposerVotingPower);

      // Let Alice's balance stay 0.
      // Set Bob's balance to the `minProposerVotingPower` value.
      await token.setBalance(
        bob.address,
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );

      // Try to create a proposal as Alice, which will revert.
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

      // Create a proposal as Bob.
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

      // Set `minProposerVotingPower` to be greater than 0.
      await plugin
        .connect(deployer)
        .updateVotingSettings(voteSettingsWithMinProposerVotingPower);

      // Set Alice's balance to the `minProposerVotingPower` value.
      await token.setBalance(
        alice.address,
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );

      const endDate = (await time.latest()) + TIME.DAY;

      // Disable auto-mining to put the following three transactions into the same block.
      await ethers.provider.send('evm_setAutomine', [false]);
      const expectedSnapshotBlockNumber = (
        await ethers.provider.getBlock('latest')
      ).number;

      // Transaction 1: Transfer the tokens from Alice to Bob.
      const tx1 = await token
        .connect(alice)
        .transfer(
          bob.address,
          voteSettingsWithMinProposerVotingPower.minProposerVotingPower
        );

      // Transaction 2: Expect the proposal creation to fail for Alice because she transferred the tokens in transaction 1.
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

      // Transaction 3: Create the proposal as Bob.
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

      // Check the balances before the block is mined. Note that `balanceOf` is a view function,
      // whose result will be immediately available and does not rely on the block to be mined.
      expect(await token.balanceOf(alice.address)).to.equal(
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );
      expect(await token.balanceOf(bob.address)).to.equal(0);

      // Mine the block. This will result in the transactions 1 to 3 to be executed.
      // Transaction 1 and 3 will produce a receipt whereas transaction 2 will revert with an error as expected.
      await ethers.provider.send('evm_mine', []);
      const minedBlockNumber = (await ethers.provider.getBlock('latest'))
        .number;

      // Expect the transaction receipts to be in the same block after the snapshot block.
      expect((await tx1.wait()).blockNumber).to.equal(minedBlockNumber);
      expect((await tx3.wait()).blockNumber).to.equal(minedBlockNumber);
      expect(minedBlockNumber).to.equal(expectedSnapshotBlockNumber + 1);

      // Expect the balances to have changed
      expect(await token.balanceOf(alice.address)).to.equal(0);
      expect(await token.balanceOf(bob.address)).to.equal(
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );

      // Check the `ProposalCreatedEvent` for the creator and proposalId
      const event = findEvent<ProposalCreatedEvent>(
        await tx3.wait(),
        'ProposalCreated'
      );
      expect(event.args.proposalId).to.equal(id);
      expect(event.args.creator).to.equal(bob.address);

      // Check that the snapshot block stored in the proposal struct is as expected.
      const proposal = await plugin.getProposal(id);
      expect(proposal.parameters.snapshotBlock).to.equal(
        expectedSnapshotBlockNumber
      );

      // Re-enable auto-mining for the subsequent tests.
      await ethers.provider.send('evm_setAutomine', [true]);
    });

    it('creates a proposal if `_msgSender` owns enough tokens in the current block', async () => {
      const {
        deployer,
        alice,
        bob,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      // Set `minProposerVotingPower` to be greater than 0.

      await plugin
        .connect(deployer)
        .updateVotingSettings(voteSettingsWithMinProposerVotingPower);

      // Set Alice's balance to the `minProposerVotingPower` value.
      await token.setBalance(
        alice.address,
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );

      // Check that Bob who has no balance and is not a delegatee can NOT create a proposal.
      const endDate = (await time.latest()) + TIME.DAY;
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

      // Check that Alice who has enough balance can create a proposal.
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
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      // Set `minProposerVotingPower` to be greater than 0.
      await plugin
        .connect(deployer)
        .updateVotingSettings(voteSettingsWithMinProposerVotingPower);

      // Set Alice's balance to the `minProposerVotingPower` value.
      await token.setBalance(
        alice.address,
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );

      // As Alice delegate all votes to Bob.
      await token.connect(alice).delegate(bob.address);

      // Check that Alice can create a proposal although she delegated to Bob.
      const endDate = (await time.latest()) + TIME.DAY;
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
      const event = findEvent<ProposalCreatedEvent>(
        await tx.wait(),
        'ProposalCreated'
      );
      expect(event.args.proposalId).to.equal(0);
    });

    it('creates a proposal if `_msgSender` owns no tokens but has enough tokens delegated to her/him in the current block', async () => {
      const {
        deployer,
        alice,
        bob,
        initializedPlugin: plugin,
        token,
        dummyActions,
        dummyMetadata,
      } = await loadFixture(globalFixture);

      // Set `minProposerVotingPower` to be greater than 0.
      await plugin
        .connect(deployer)
        .updateVotingSettings(voteSettingsWithMinProposerVotingPower);

      // Set Alice's balance to the `minProposerVotingPower` value.
      await token.setBalance(
        alice.address,
        voteSettingsWithMinProposerVotingPower.minProposerVotingPower
      );

      const endDate = (await time.latest()) + TIME.DAY;

      // As Alice, delegate to Bob.
      await token.connect(alice).delegate(bob.address);

      // Check that Bob being a delegate can create a proposal.
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

      // Set `minProposerVotingPower` to be greater than 0.
      await plugin
        .connect(deployer)
        .updateVotingSettings(voteSettingsWithMinProposerVotingPower);

      // Set Alice's balance to one and Bob's balance to the `minProposerVotingPower` value.
      await setBalances(token, [
        {
          receiver: alice.address,
          amount: 1,
        },
        {
          receiver: bob.address,
          amount:
            voteSettingsWithMinProposerVotingPower.minProposerVotingPower as BigNumber,
        },
      ]);

      const endDate = (await time.latest()) + TIME.DAY;

      // Check that Alice who has not enough tokens cannot create a proposal.
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

      // As Alice delegate all votes to Bob.
      await token.connect(alice).delegate(bob.address);

      // Check that Alice still cannot create a proposal.
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

    // Check that a proposal cannot be created.
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

    // Make sure the supply is not zero.
    await setTotalSupply(token, 1);

    // Create a start date that is in the past.
    const currentDate = await time.latest();
    const startDateInThePast = currentDate - 1;
    const endDate = 0; // startDate + minDuration

    // Check that the proposal creation fails.
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

    // Make sure the supply is not zero.
    await setTotalSupply(token, 1);

    // Pick a start date that is close to the `MAX_UINT64` value so that adding `minDuration` results in an overflow.
    const MAX_UINT64 = ethers.BigNumber.from(2).pow(64).sub(1);
    const latestStartDate = MAX_UINT64.sub(
      await defaultVotingSettings.minDuration
    );
    const tooLateStartDate = latestStartDate.add(1);
    const endDate = 0; // startDate + minDuration

    // Check that the proposal creation reverts.
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

    // Make sure the supply is not zero.
    await setTotalSupply(token, 1);

    // Pick an end date that is less then `minDuration` after the start date.
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

  it('sets the startDate to now and endDate to startDate + minDuration, if zeros are provided as an inputs', async () => {
    const {
      alice,
      initializedPlugin: plugin,
      token,
      defaultVotingSettings,
      dummyMetadata,
    } = await loadFixture(globalFixture);

    // Make sure the supply is not zero.
    await setTotalSupply(token, 1);

    // Create a proposal with zero as an input for `startDate` and `endDate`
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
    const event = findEvent<ProposalCreatedEvent>(
      await creationTx.wait(),
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

    // Set the `minParticipation` value to have a remainder that will get dropped when calculating `minVotingPower`.
    const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
      votingMode: VotingMode.EarlyExecution,
      supportThreshold: pctToRatio(50),
      minParticipation: pctToRatio(30).add(1), // 30.0001 %, which will result in the `minVotingPower` getting ceiled to 4.
      minDuration: TIME.HOUR,
      minProposerVotingPower: 0,
    };
    await plugin.connect(deployer).updateVotingSettings(votingSettings);

    // Create a proposal.
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
    const event = findEvent<ProposalCreatedEvent>(
      await tx.wait(),
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

    // Set the `minParticipation` to value without a remainder that won't get ceiled when calculating `minVotingPower`.
    const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
      votingMode: VotingMode.EarlyExecution,
      supportThreshold: pctToRatio(50),
      minParticipation: pctToRatio(30), // 30.0000 %, which will result in the `minVotingPower` being 3.
      minDuration: TIME.HOUR,
      minProposerVotingPower: 0,
    };
    await plugin.connect(deployer).updateVotingSettings(votingSettings);

    // Create a proposal
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
    const event = findEvent<ProposalCreatedEvent>(
      await tx.wait(),
      'ProposalCreated'
    );
    expect(event.args.proposalId).to.equal(id);

    expect((await plugin.getProposal(id)).parameters.minVotingPower).to.eq(3); // 3 out of 10 votes must be casted for the proposal to pass
  });

  it('should create a proposal successfully, but not vote', async () => {
    const {
      alice,
      initializedPlugin: plugin,
      token,
      defaultVotingSettings,
      dummyActions,
      dummyMetadata,
    } = await loadFixture(globalFixture);

    const allowFailureMap = 1;

    // Set Alice's balance to 10
    await token.setBalance(alice.address, 10);

    // Create a proposal as Alice.
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

    // Check that the `ProposalCreated` event is emitted and `VoteCast` is not.
    await expect(tx)
      .to.emit(plugin, 'ProposalCreated')
      .to.not.emit(plugin, VOTING_EVENTS.VOTE_CAST);

    // Check that `ProposalCreated` event contains the expected data.
    const event = findEvent<ProposalCreatedEvent>(
      await tx.wait(),
      'ProposalCreated'
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

    // Check that the proposal state is set to the expected data.
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
      proposal.parameters.startDate.add(await defaultVotingSettings.minDuration)
    ).to.equal(proposal.parameters.endDate);

    expect(
      await plugin.totalVotingPower(proposal.parameters.snapshotBlock)
    ).to.equal(10);
    expect(proposal.tally.yes).to.equal(0);
    expect(proposal.tally.no).to.equal(0);
    expect(proposal.tally.abstain).to.equal(0);

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

    // Set Alice's balance to 10.
    await token.setBalance(alice.address, 10);

    // Create a proposal as Alice.
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

    // Check that the `ProposalCreated` and `VoteCast` events are emitted with the expected data.
    await expect(tx)
      .to.emit(plugin, 'ProposalCreated')
      .to.emit(plugin, VOTING_EVENTS.VOTE_CAST)
      .withArgs(id, alice.address, VoteOption.Yes, 10);

    const event = findEvent<ProposalCreatedEvent>(
      await tx.wait(),
      'ProposalCreated'
    );
    expect(event.args.proposalId).to.equal(id);
    expect(event.args.creator).to.equal(alice.address);
    expect(event.args.metadata).to.equal(dummyMetadata);
    expect(event.args.actions.length).to.equal(1);
    expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
    expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
    expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
    expect(event.args.allowFailureMap).to.equal(0);

    // Check that the proposal state is set to the expected data.
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

    // Make sure the supply is not zero.
    await setTotalSupply(token, 1);

    // Try to create a proposal as Alice and vote before the start date, which must revert.
    const startDate = (await time.latest()) + TIME.HOUR;
    const endDate = startDate + TIME.DAY;
    expect(await time.latest()).to.be.lessThan(startDate);
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

    // Check that the proposal can be created without voting (by setting `_voteOption` to `VoteOption.None`).
    const tx = await plugin.createProposal(
      dummyMetadata,
      dummyActions,
      0,
      startDate,
      endDate,
      VoteOption.None,
      false
    );
    const event = findEvent<ProposalCreatedEvent>(
      await tx.wait(),
      'ProposalCreated'
    );
    expect(event.args.proposalId).to.equal(id);
  });
});
