import {ITokenVoting as MajorityVotingBase} from '../../typechain';
import {globalFixture} from '../test-utils/fixture';
import {VotingMode} from '../test-utils/voting-helpers';
import {TIME, pctToRatio} from '@aragon/osx-commons-sdk';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('initialize', async () => {
  it('reverts if trying to re-initialize', async () => {
    const {dao, initializedPlugin, defaultVotingSettings, token} =
      await loadFixture(globalFixture);

    // Try to reinitialize the initialized plugin.
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

    // Initialize the uninitialized plugin.
    await expect(
      await uninitializedPlugin.initialize(
        dao.address,
        defaultVotingSettings,
        token.address
      )
    )
      .to.emit(uninitializedPlugin, 'MembershipContractAnnounced')
      .withArgs(token.address);
  });

  it('sets the voting settings and token', async () => {
    const {
      dao,
      uninitializedPlugin: plugin,
      token,
    } = await loadFixture(globalFixture);

    // Check that the uninitialized plugin doesn't have voting settings and token set yet.
    expect(await plugin.minDuration()).to.equal(0);
    expect(await plugin.minParticipation()).to.equal(0);
    expect(await plugin.minProposerVotingPower()).to.equal(0);
    expect(await plugin.supportThreshold()).to.equal(0);
    expect(await plugin.votingMode()).to.equal(0);
    expect(await plugin.getVotingToken()).to.equal(
      ethers.constants.AddressZero
    );

    // Pick settings that differ from the uninitialized values.
    const votingSettings: MajorityVotingBase.VotingSettingsStruct = {
      votingMode: VotingMode.EarlyExecution,
      supportThreshold: pctToRatio(50),
      minParticipation: pctToRatio(20),
      minDuration: TIME.HOUR,
      minProposerVotingPower: 123,
    };

    // Initialize the plugin.
    await plugin.initialize(dao.address, votingSettings, token.address);

    // Check that the voting settings have been set.
    expect(await plugin.minDuration()).to.equal(votingSettings.minDuration);
    expect(await plugin.minParticipation()).to.equal(
      votingSettings.minParticipation
    );
    expect(await plugin.minProposerVotingPower()).to.equal(
      votingSettings.minProposerVotingPower
    );
    expect(await plugin.supportThreshold()).to.equal(
      votingSettings.supportThreshold
    );
    expect(await plugin.votingMode()).to.equal(votingSettings.votingMode);

    // Check that the token has been set.
    expect(await plugin.getVotingToken()).to.equal(token.address);
  });
});
