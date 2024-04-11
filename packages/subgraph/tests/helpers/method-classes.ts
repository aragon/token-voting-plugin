/**
 * IMPORTANT: Do not export classes from this file.
 * The classes of this file are meant to be incorporated into the classes of ./extended-schema.ts
 */
import {
  TokenVotingMember,
  ERC20WrapperContract,
  TokenVotingPlugin,
  TokenVotingProposal,
  TokenVotingVote,
  TokenVotingVoter,
  ERC20Contract,
  Action,
} from '../../generated/schema';
import {
  DelegateChanged,
  DelegateVotesChanged,
} from '../../generated/templates/GovernanceERC20/GovernanceERC20';
import {Transfer} from '../../generated/templates/TokenVoting/ERC20';
import {
  MembershipContractAnnounced,
  ProposalCreated,
  ProposalExecuted,
  VoteCast,
  VotingSettingsUpdated,
} from '../../generated/templates/TokenVoting/TokenVoting';
import {
  VOTER_OPTIONS,
  VOTE_OPTIONS,
  VOTING_MODES,
  VOTING_MODE_UNDEFINED_INDEX,
} from '../../src/utils/constants';
import {generateMemberEntityId} from '../../src/utils/ids';
import {
  createNewDelegateChangedEvent,
  createNewDelegateVotesChangedEvent,
  createNewMembershipContractAnnouncedEvent,
  createNewProposalCreatedEvent,
  createNewProposalExecutedEvent,
  createNewVoteCastEvent,
  createNewVotingSettingsUpdatedEvent,
  delegatesCall,
  getBalanceOf,
  getProposalCountCall,
  getSupportsInterface,
  createNewERC20TransferEventWithAddress,
  getDelegatee,
  getVotes,
} from '../utils';
import {createGetProposalCall, createTotalVotingPowerCall} from '../utils';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ALLOW_FAILURE_MAP,
  CONTRACT_ADDRESS,
  CREATED_AT,
  DAO_ADDRESS,
  END_DATE,
  MIN_VOTING_POWER,
  PROPOSAL_ENTITY_ID,
  PLUGIN_PROPOSAL_ID,
  SNAPSHOT_BLOCK,
  START_DATE,
  SUPPORT_THRESHOLD,
  TOTAL_VOTING_POWER,
  TWO,
  VOTING_MODE,
  ZERO,
  MIN_PARTICIPATION,
  MIN_DURATION,
  DAO_TOKEN_ADDRESS,
  STRING_DATA,
  MIN_PROPOSER_VOTING_POWER,
  NEW_MIN_PROPOSER_VOTING_POWER,
  NEW_MIN_PARTICIPATION,
  NEW_SUPPORT_THRESHOLD,
  NEW_MIN_DURATION,
  ONE_ETH,
} from '../utils';
import {
  generateEntityIdFromAddress,
  generatePluginEntityId,
  createERC20TokenCalls,
  createWrappedERC20TokenCalls,
  createDummyAction,
  generateActionEntityId,
} from '@aragon/osx-commons-subgraph';
import {Address, BigInt, Bytes, ethereum} from '@graphprotocol/graph-ts';

class ERC20WrapperContractMethods extends ERC20WrapperContract {
  withDefaultValues(): ERC20WrapperContractMethods {
    this.id = Address.fromHexString(CONTRACT_ADDRESS).toHexString();
    this.name = 'Wrapped Test Token';
    this.symbol = 'WTT';
    this.decimals = 18;
    this.underlyingToken =
      Address.fromHexString(DAO_TOKEN_ADDRESS).toHexString();
    return this;
  }
  // calls
  mockCall_createTokenCalls(totalSupply: string | null = null): void {
    if (!this.name) {
      throw new Error('Name is null');
    } else if (!this.symbol) {
      throw new Error('Symbol is null');
    } else if (!this.underlyingToken) {
      throw new Error('Underlying token is null');
    }
    let supply = '10';
    if (totalSupply) {
      supply = totalSupply;
    }

    createWrappedERC20TokenCalls(
      this.id,
      this.underlyingToken,
      supply,
      this.name as string,
      this.symbol as string
    );
  }

  mockCall_supportsInterface(interfaceId: string, value: boolean): void {
    getSupportsInterface(this.id, interfaceId, value);
  }

  mockCall_balanceOf(account: string, amount: string): void {
    getBalanceOf(this.id, account, amount);
  }
}

class ERC20ContractMethods extends ERC20Contract {
  withDefaultValues(): ERC20ContractMethods {
    this.id = Address.fromHexString(DAO_TOKEN_ADDRESS).toHexString();
    this.name = 'DAO Token';
    this.symbol = 'DAOT';
    this.decimals = 6;

    return this;
  }

  // calls
  mockCall_createTokenCalls(totalSupply: string | null = null): void {
    if (!this.name) {
      throw new Error('Name is null');
    }
    if (!this.symbol) {
      throw new Error('Symbol is null');
    }
    let supply = '10';
    if (totalSupply) {
      supply = totalSupply;
    }
    // we cast to string only for stoping rust compiler complaints.
    createERC20TokenCalls(
      this.id,
      supply,
      this.name as string,
      this.symbol as string,
      this.decimals.toString()
    );
  }

  mockCall_supportsInterface(interfaceId: string, value: boolean): void {
    getSupportsInterface(this.id, interfaceId, value);
  }

  mockCall_balanceOf(account: string, amount: string): void {
    getBalanceOf(this.id, account, amount);
  }
}

// Token Voting
class TokenVotingVoterMethods extends TokenVotingVoter {
  withDefaultValues(): TokenVotingVoterMethods {
    const memberAddress = Address.fromString(ADDRESS_ONE);
    const memberId = generateEntityIdFromAddress(memberAddress);
    const pluginAddress = Address.fromString(CONTRACT_ADDRESS);
    const pluginEntityId = generatePluginEntityId(pluginAddress);
    this.id = generateMemberEntityId(pluginAddress, memberAddress);
    this.address = memberId;
    this.plugin = pluginEntityId;
    this.lastUpdated = BigInt.zero();

    return this;
  }
}

class TokenVotingProposalMethods extends TokenVotingProposal {
  votingModeIndex: string = VOTING_MODE;

  withDefaultValues(
    votingModeIndex: string = VOTING_MODE
  ): TokenVotingProposalMethods {
    this.id = PROPOSAL_ENTITY_ID;

    this.daoAddress = Bytes.fromHexString(DAO_ADDRESS);
    this.plugin = Address.fromHexString(CONTRACT_ADDRESS).toHexString();
    this.pluginProposalId = BigInt.fromString(PLUGIN_PROPOSAL_ID);
    this.creator = Address.fromHexString(ADDRESS_ONE);

    this.open = true;
    this.executed = false;

    // for event we need the index of the mapping to simulate the contract event
    this.votingModeIndex = votingModeIndex;
    this.votingMode = VOTING_MODES.has(parseInt(votingModeIndex))
      ? (VOTING_MODES.get(parseInt(votingModeIndex)) as string)
      : (VOTING_MODES.get(VOTING_MODE_UNDEFINED_INDEX) as string);

    this.supportThreshold = BigInt.fromString(SUPPORT_THRESHOLD);
    this.minVotingPower = BigInt.fromString(MIN_VOTING_POWER);
    this.startDate = BigInt.fromString(START_DATE);
    this.endDate = BigInt.fromString(END_DATE);
    this.snapshotBlock = BigInt.fromString(SNAPSHOT_BLOCK);

    this.yes = BigInt.fromString(ZERO);
    this.no = BigInt.fromString(ZERO);
    this.abstain = BigInt.fromString(ZERO);
    this.castedVotingPower = BigInt.fromString(ZERO);

    this.totalVotingPower = BigInt.fromString(TOTAL_VOTING_POWER);
    this.allowFailureMap = BigInt.fromString(ALLOW_FAILURE_MAP);
    this.createdAt = BigInt.fromString(CREATED_AT);
    this.creationBlockNumber = BigInt.fromString(ZERO);
    this.approvalReached = false;
    this.isSignaling = false;

    return this;
  }

  // calls
  // (only read call from contracts related to this)
  mockCall_getProposal(actions: ethereum.Tuple[]): void {
    if (!this.yes || !this.no || !this.abstain) {
      throw new Error('Yes, No, or Abstain can not be null');
    } else {
      createGetProposalCall(
        this.plugin,
        this.pluginProposalId.toString(),
        this.open,
        this.executed,
        this.votingModeIndex as string, // we need the index for this mocked call
        this.supportThreshold.toString(),
        this.minVotingPower.toString(),
        this.startDate.toString(),
        this.endDate.toString(),
        this.snapshotBlock.toString(),
        (this.abstain as BigInt).toString(),
        (this.yes as BigInt).toString(),
        (this.no as BigInt).toString(),
        actions,
        this.allowFailureMap.toString()
      );
    }
  }

  mockCall_totalVotingPower(): void {
    createTotalVotingPowerCall(
      this.plugin,
      this.snapshotBlock.toString(),
      this.totalVotingPower.toString()
    );
  }

  // event
  createEvent_ProposalCreated(
    actions: ethereum.Tuple[],
    description: string = STRING_DATA
  ): ProposalCreated {
    let event = createNewProposalCreatedEvent(
      this.pluginProposalId.toString(),
      this.creator.toHexString(),
      this.startDate.toString(),
      this.endDate.toString(),
      description,
      actions,
      this.allowFailureMap.toString(),
      this.plugin
    );

    return event;
  }

  createEvent_VoteCast(
    voter: string,
    voterVoteOption: string,
    voterVotingPower: string
  ): VoteCast {
    if (!VOTE_OPTIONS.has(voterVoteOption)) {
      throw new Error('Voter vote option is not valid.');
    }

    // we use casting here to remove autocompletion complaint
    // since we know it will be captured by the previous check
    let voteOption = VOTE_OPTIONS.get(voterVoteOption) as string;

    let event = createNewVoteCastEvent(
      this.pluginProposalId.toString(),
      voter,
      voteOption,
      voterVotingPower,
      this.plugin
    );
    return event;
  }

  createEvent_ProposalExecuted(): ProposalExecuted {
    let event = createNewProposalExecutedEvent(
      this.pluginProposalId.toString(),
      this.plugin
    );
    return event;
  }
}

class ActionMethods extends Action {
  withDefaultValues(): ActionMethods {
    this.id = generateActionEntityId(
      Address.fromString(CONTRACT_ADDRESS),
      Address.fromString(DAO_ADDRESS),
      PLUGIN_PROPOSAL_ID,
      0
    );
    this.to = Address.fromHexString(DAO_TOKEN_ADDRESS);
    this.value = BigInt.fromString(ZERO);
    this.data = Bytes.fromHexString('0x00000000');
    this.daoAddress = Bytes.fromHexString(DAO_ADDRESS);
    this.proposal = PROPOSAL_ENTITY_ID;
    return this;
  }

  getDummyAction(): ethereum.Tuple {
    return createDummyAction(
      this.to.toHexString(),
      this.value.toString(),
      this.data.toHexString()
    );
  }
}

class TokenVotingVoteMethods extends TokenVotingVote {
  // build entity
  // if id not changed it will update
  withDefaultValues(): TokenVotingVoteMethods {
    let voterOptionIndex = 0;
    if (!VOTER_OPTIONS.has(voterOptionIndex)) {
      throw new Error('Voter option is not valid.');
    }

    // we use casting here to remove autocompletion complaint
    // since we know it will be captured by the previous check
    let voterOption = VOTER_OPTIONS.get(voterOptionIndex) as string;

    this.id = ADDRESS_ONE.concat('_').concat(PROPOSAL_ENTITY_ID);
    this.voter = Address.fromHexString(CONTRACT_ADDRESS)
      .toHexString()
      .concat('_')
      .concat(ADDRESS_ONE);
    this.proposal = PROPOSAL_ENTITY_ID;
    this.voteOption = voterOption;
    this.votingPower = BigInt.fromString(TWO);
    this.createdAt = BigInt.fromString(CREATED_AT);
    this.voteReplaced = false;
    this.updatedAt = BigInt.fromString(ZERO);

    return this;
  }
}

class TokenVotingPluginMethods extends TokenVotingPlugin {
  votingModeIndex: string = VOTING_MODE;
  // build entity
  // if id not changed it will update
  withDefaultValues(
    votingModeIndex: string = VOTING_MODE
  ): TokenVotingPluginMethods {
    const pluginAddress = Address.fromString(CONTRACT_ADDRESS);
    const pluginEntityId = generatePluginEntityId(pluginAddress);

    this.id = pluginEntityId;
    this.daoAddress = Bytes.fromHexString(DAO_ADDRESS);
    this.pluginAddress = pluginAddress;

    this.votingModeIndex = votingModeIndex; // for event we need the index of the mapping to simulate the contract event
    this.votingMode = VOTING_MODES.has(parseInt(votingModeIndex))
      ? (VOTING_MODES.get(parseInt(votingModeIndex)) as string)
      : (VOTING_MODES.get(VOTING_MODE_UNDEFINED_INDEX) as string);

    this.supportThreshold = BigInt.fromString(SUPPORT_THRESHOLD);
    this.minParticipation = BigInt.fromString(MIN_PARTICIPATION);
    this.minDuration = BigInt.fromString(MIN_DURATION);
    this.minProposerVotingPower = BigInt.fromString(MIN_PROPOSER_VOTING_POWER);
    this.proposalCount = BigInt.zero();
    this.token = DAO_TOKEN_ADDRESS;

    return this;
  }

  mockCall_getProposalCountCall(): void {
    getProposalCountCall(
      this.pluginAddress.toHexString(),
      this.proposalCount.toString()
    );
  }

  createEvent_VotingSettingsUpdated(): VotingSettingsUpdated {
    let event = createNewVotingSettingsUpdatedEvent(
      this.votingModeIndex as string, // we need the index for simulate the event
      (this.supportThreshold as BigInt).toString(),
      (this.minParticipation as BigInt).toString(),
      (this.minDuration as BigInt).toString(),
      (this.minProposerVotingPower as BigInt).toString(),
      this.pluginAddress.toHexString()
    );

    return event;
  }

  createEvent_MembershipContractAnnounced(): MembershipContractAnnounced {
    if (this.token === null) {
      throw new Error('Token is null');
    }
    let event = createNewMembershipContractAnnouncedEvent(
      this.token as string,
      this.pluginAddress.toHexString()
    );

    return event;
  }

  setNewPluginSetting(
    votingModeIndex: string = TWO,
    newSupportThreshold: BigInt = BigInt.fromString(NEW_SUPPORT_THRESHOLD),
    newMinParticipation: BigInt = BigInt.fromString(NEW_MIN_PARTICIPATION),
    newMinDuration: BigInt = BigInt.fromString(NEW_MIN_DURATION),
    newMinProposerVotingPower: BigInt = BigInt.fromString(
      NEW_MIN_PROPOSER_VOTING_POWER
    )
  ): TokenVotingPluginMethods {
    this.votingModeIndex = votingModeIndex;
    this.votingMode = VOTING_MODES.has(parseInt(votingModeIndex))
      ? (VOTING_MODES.get(parseInt(votingModeIndex)) as string)
      : (VOTING_MODES.get(VOTING_MODE_UNDEFINED_INDEX) as string);
    this.supportThreshold = newSupportThreshold;
    this.minParticipation = newMinParticipation;
    this.minDuration = newMinDuration;
    this.minProposerVotingPower = newMinProposerVotingPower;

    return this;
  }
}

// TokenVotingMember
class TokenVotingMemberMethods extends TokenVotingMember {
  withDefaultValues(
    memberAddress: Address = Address.fromString(ADDRESS_ONE),
    pluginAddress: Address = Address.fromString(CONTRACT_ADDRESS)
  ): TokenVotingMemberMethods {
    const plugin = pluginAddress;
    const member = memberAddress;
    let id = generateMemberEntityId(plugin, member);

    this.id = id;
    this.address = memberAddress;
    this.balance = BigInt.zero();
    this.plugin = plugin.toHexString();
    this.delegatee = null;
    this.votingPower = BigInt.zero();

    return this;
  }

  mockCall_delegatesCall(
    tokenContractAddress: string,
    account: string,
    returns: string
  ): void {
    delegatesCall(tokenContractAddress, account, returns);
  }

  mockCall_getBalanceOf(account: string, value: string = '0'): void {
    getBalanceOf(DAO_TOKEN_ADDRESS, account, value);
  }

  mockCall_getDelegatee(account: string): void {
    getDelegatee(DAO_TOKEN_ADDRESS, account, null);
  }

  mockCall_getVotes(toAddress: string, value: string = '0'): void {
    getVotes(DAO_TOKEN_ADDRESS, toAddress, value);
  }

  createEvent_DelegateChanged(
    delegator: string = this.address.toHexString(),
    fromDelegate: string = this.address.toHexString(),
    toDelegate: string = this.address.toHexString(),
    tokenContract: string = Address.fromHexString(
      DAO_TOKEN_ADDRESS
    ).toHexString()
  ): DelegateChanged {
    let event = createNewDelegateChangedEvent(
      delegator,
      fromDelegate,
      toDelegate,
      tokenContract
    );

    return event;
  }

  createEvent_DelegateVotesChanged(
    newBalance: string = '0',
    previousBalance: string = '0',
    tokenContract: string = Address.fromHexString(
      DAO_TOKEN_ADDRESS
    ).toHexString()
  ): DelegateVotesChanged {
    let event = createNewDelegateVotesChangedEvent(
      this.address.toHexString(),
      previousBalance,
      newBalance,
      tokenContract
    );

    return event;
  }

  createEvent_Transfer(
    from: string = ADDRESS_ONE,
    to: string = ADDRESS_TWO,
    amount: string = ONE_ETH
  ): Transfer {
    let event = createNewERC20TransferEventWithAddress(
      from,
      to,
      amount,
      DAO_TOKEN_ADDRESS
    );

    return event;
  }
}
