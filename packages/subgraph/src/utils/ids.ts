import {
  generateEntityIdFromAddress, // generateEntityIdFromBytes,
} from '@aragon/osx-commons-subgraph';
import {Address} from '@graphprotocol/graph-ts';

export function generateTokenEntityId(tokenAddress: Address): string {
  return generateEntityIdFromAddress(tokenAddress);
}

export function generateMemberEntityId(
  pluginAddress: Address,
  memberAddress: Address
): string {
  return [
    generateEntityIdFromAddress(pluginAddress),
    generateEntityIdFromAddress(memberAddress),
  ].join('_');
}

export function generateVoteEntityId(
  memberAddress: Address,
  proposalId: string
): string {
  return [generateEntityIdFromAddress(memberAddress), proposalId].join('_');
}
