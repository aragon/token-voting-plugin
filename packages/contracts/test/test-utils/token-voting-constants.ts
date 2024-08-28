import {ethers} from 'hardhat';

export const TOKEN_VOTING_INTERFACE = new ethers.utils.Interface([
  'function initialize(address,tuple(uint8,uint32,uint32,uint64,uint256),address)',
  'function getVotingToken()',
]);

export const MAJORITY_VOTING_BASE_INTERFACE = new ethers.utils.Interface([
  'function minDuration()',
  'function minProposerVotingPower()',
  'function votingMode()',
  'function totalVotingPower(uint256)',
  'function getProposal(uint256)',
  'function updateVotingSettings(tuple(uint8,uint32,uint32,uint64,uint256))',
  'function createProposal(bytes,tuple(address,uint256,bytes)[],uint256,uint64,uint64,uint8,bool)',
]);

export const UPDATE_VOTING_SETTINGS_PERMISSION_ID = ethers.utils.id(
  'UPDATE_VOTING_SETTINGS_PERMISSION'
);

export const MINT_PERMISSION_ID = ethers.utils.id('MINT_PERMISSION');

export const VOTING_EVENTS = {
  VOTING_SETTINGS_UPDATED: 'VotingSettingsUpdated',
  VOTE_CAST: 'VoteCast',
};

export const INITIALIZE_SIGNATURE_OLD =
  'initialize(address,(uint8,uint32,uint32,uint64,uint256),address)';
export const INITIALIZE_SIGNATURE =
  'initialize(address,(uint8,uint32,uint32,uint64,uint256),address,uint32)';
