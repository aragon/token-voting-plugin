import {loadFixture as hardhatLoadFixture} from '@nomicfoundation/hardhat-network-helpers';
import hre from 'hardhat';

export async function loadFixtureCustom<T>(
  fixture: () => Promise<T>
): Promise<T> {
  if (
    !['zkLocalTestnet', 'zkTestnet', 'zkMainnet'].includes(hre.network.name)
  ) {
    // Use Hardhat's loadFixture for non-zkSync networks
    return await hardhatLoadFixture(fixture);
  } else {
    // Directly call the fixture function for zkSync networks
    return await fixture();
  }
}
