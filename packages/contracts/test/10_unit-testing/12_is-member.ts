import {globalFixture} from '../test-utils/fixture';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {expect} from 'chai';

describe('isMember', async () => {
  it('returns true if the account currently owns at least one token', async () => {
    const {alice, bob, initializedPlugin, token} = await loadFixture(
      globalFixture
    );

    // Set alice's balance to 1, while bob's is still 0.
    await token.setBalance(alice.address, 1);

    // Check that only Alice is a member.
    expect(await initializedPlugin.isMember(alice.address)).to.be.true;
    expect(await initializedPlugin.isMember(bob.address)).to.be.false;
  });

  it('returns true if the account currently has at least one token delegated to her/him', async () => {
    const {
      alice,
      bob,
      initializedPlugin: plugin,
      token,
    } = await loadFixture(globalFixture);

    // Set Alice's balance to 1, while Bob's is still 0.
    await token.setBalance(alice.address, 1);

    // Check the balances of Alice and Bob.
    expect(await token.balanceOf(alice.address)).to.eq(1);
    expect(await token.balanceOf(bob.address)).to.eq(0);

    // As Alice, delegate votes to Bob.
    await token.connect(alice).delegate(bob.address);

    expect(await token.getVotes(alice.address)).to.eq(0);
    expect(await token.getVotes(bob.address)).to.eq(1);

    // Check that both, Alice and Bob, are members.

    expect(await plugin.isMember(alice.address)).to.be.true;
    expect(await plugin.isMember(bob.address)).to.be.true;
  });
});
