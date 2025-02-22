export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

export const VOTING_MODE_UNDEFINED = 10;

// AS does not support initializing Map with data, a chain of sets is used instead
export const VOTER_OPTIONS = new Map<number, string>()
  .set(0, 'None')
  .set(1, 'Abstain')
  .set(2, 'Yes')
  .set(3, 'No');

export const VOTE_OPTIONS = new Map<string, string>()
  .set('None', '0')
  .set('Abstain', '1')
  .set('Yes', '2')
  .set('No', '3');

export const VOTING_MODES = new Map<number, string>()
  .set(0, 'Standard')
  .set(1, 'EarlyExecution')
  .set(2, 'VoteReplacement')
  .set(VOTING_MODE_UNDEFINED, 'Undefined');

export const TOKEN_VOTING_INTERFACE_ID = '0x50eb001e';
export const GOVERNANCE_WRAPPED_ERC20_INTERFACE_ID = '0x0f13099a';

export const RATIO_BASE = '1000000'; // 10**6
