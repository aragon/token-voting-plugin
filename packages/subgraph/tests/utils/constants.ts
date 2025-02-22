import {generateProposalEntityId} from '@aragon/osx-commons-subgraph';
import {Address, BigInt} from '@graphprotocol/graph-ts';

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const ADDRESS_ONE = '0x0000000000000000000000000000000000000001';
export const ADDRESS_TWO = '0x0000000000000000000000000000000000000002';
export const ADDRESS_THREE = '0x0000000000000000000000000000000000000003';
export const ADDRESS_FOUR = '0x0000000000000000000000000000000000000004';
export const ADDRESS_FIVE = '0x0000000000000000000000000000000000000005';
export const ADDRESS_SIX = '0x0000000000000000000000000000000000000006';
export const ADDRESS_SEVEN = '0x0000000000000000000000000000000000000007';
export const DAO_ADDRESS = '0x00000000000000000000000000000000000000da';
export const CONTRACT_ADDRESS = '0x00000000000000000000000000000000000000Ad';
export const DAO_TOKEN_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
export const DEFAULT_MOCK_EVENT_ADDRESS =
  '0xA16081F360e3847006dB660bae1c6d1b2e17eC2A';

export const ZERO = '0';
export const ONE = '1';
export const TWO = '2';
export const THREE = '3';

export const PLUGIN_PROPOSAL_ID = ZERO;

export const STRING_DATA = 'Some String Data ...';

export const ONE_ETH = '1000000000000000000';

export const ERC20_AMOUNT_FULL = '20000';

export const HOUR = '3600';
export const TWO_HOURS = '7200';

export const VOTING_MODE: string = ONE; // EarlyExecution
export const UNDEFINED_VOTING_MODE = 11;
export const SUPPORT_THRESHOLD = '500000'; // 50*10**4 = 50%
export const NEW_SUPPORT_THRESHOLD = '400000'; // 40*10**4 = 40%
export const MIN_PARTICIPATION = '500000'; // 50*10**4 = 50%
export const NEW_MIN_PARTICIPATION = '400000'; // 40*10**4 = 40%
export const MIN_DURATION = HOUR;
export const NEW_MIN_DURATION = TWO_HOURS;

export const MIN_PROPOSER_VOTING_POWER = ZERO;
export const NEW_MIN_PROPOSER_VOTING_POWER = ONE;
export const START_DATE = '1644851000';
export const END_DATE = '1644852000';
export const SNAPSHOT_BLOCK = '100';

// Use 1 for testing as default value is anyways 0
// and test might succeed even though it shouldn't
export const ALLOW_FAILURE_MAP = '1';

export const MIN_VOTING_POWER = TWO;
export const TOTAL_VOTING_POWER = THREE;
export const CREATED_AT = ONE;

export const PLUGIN_SETUP_ID =
  '0xfb3fd2c4cd4e19944dd3f8437e67476240cd9e3efb2294ebd10c59c8f1d6817c';

export const PROPOSAL_ENTITY_ID = generateProposalEntityId(
  Address.fromString(CONTRACT_ADDRESS),
  BigInt.fromString(PLUGIN_PROPOSAL_ID)
);
