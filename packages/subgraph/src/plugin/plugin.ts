import {
  Action,
  TokenVotingPlugin,
  TokenVotingProposal,
  TokenVotingVoter,
  TokenVotingVote,
} from '../../generated/schema';
import {GovernanceERC20} from '../../generated/templates';
import {
  VoteCast,
  ProposalCreated,
  ProposalExecuted,
  VotingSettingsUpdated,
  MembershipContractAnnounced,
  TokenVoting,
} from '../../generated/templates/TokenVoting/TokenVoting';
import {
  RATIO_BASE,
  VOTER_OPTIONS,
  VOTING_MODES,
  VOTING_MODE_UNDEFINED,
} from '../utils/constants';
import {identifyAndFetchOrCreateERC20TokenEntity} from '../utils/erc20';
import {generateMemberEntityId, generateVoteEntityId} from '../utils/ids';
import {
  generatePluginEntityId,
  generateProposalEntityId,
  generateActionEntityId,
} from '@aragon/osx-commons-subgraph';
import {
  Address,
  BigInt,
  Bytes,
  dataSource,
  DataSourceContext,
} from '@graphprotocol/graph-ts';

export function handleProposalCreated(event: ProposalCreated): void {
  const context = dataSource.context();
  const daoId = context.getString('daoAddress');
  const metadata = event.params.metadata.toString();
  _handleProposalCreated(event, daoId, metadata);
}

export function _handleProposalCreated(
  event: ProposalCreated,
  daoId: string,
  metadata: string
): void {
  const pluginAddress = event.address;
  const pluginEntityId = generatePluginEntityId(pluginAddress);
  const pluginProposalId = event.params.proposalId;
  const proposalEntityId = generateProposalEntityId(
    pluginAddress,
    pluginProposalId
  );

  const proposalEntity = new TokenVotingProposal(proposalEntityId);
  proposalEntity.daoAddress = Bytes.fromHexString(daoId);
  proposalEntity.plugin = pluginEntityId;
  proposalEntity.pluginProposalId = pluginProposalId;
  proposalEntity.creator = event.params.creator;
  proposalEntity.metadata = metadata;
  proposalEntity.createdAt = event.block.timestamp;
  proposalEntity.creationBlockNumber = event.block.number;
  proposalEntity.allowFailureMap = event.params.allowFailureMap;
  proposalEntity.approvalReached = false;

  const contract = TokenVoting.bind(pluginAddress);
  const proposal = contract.try_getProposal(pluginProposalId);

  if (!proposal.reverted) {
    proposalEntity.open = proposal.value.value0;
    proposalEntity.executed = proposal.value.value1;

    // ProposalParameters
    const parameters = proposal.value.value2;
    let votingModeIndex = parameters.votingMode;
    proposalEntity.votingModeIndex = votingModeIndex;
    if (!VOTING_MODES.has(votingModeIndex)) {
      // if the voting mode is not defined, set it to 'Undefined'
      votingModeIndex = VOTING_MODE_UNDEFINED;
    }
    proposalEntity.votingMode = VOTING_MODES.get(votingModeIndex) as string;
    proposalEntity.supportThreshold = parameters.supportThreshold;
    proposalEntity.snapshotBlock = parameters.snapshotBlock;
    proposalEntity.minVotingPower = parameters.minVotingPower;

    // Get the dates from `parameters` returned from `getProposal()`,
    // so all the dates are correct in both build 1 & 2
    proposalEntity.startDate = parameters.startDate;
    proposalEntity.endDate = parameters.endDate;

    // Tally
    const tally = proposal.value.value3;
    proposalEntity.abstain = tally.abstain;
    proposalEntity.yes = tally.yes;
    proposalEntity.no = tally.no;

    // Actions
    const actions = proposal.value.value4;
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];

      const actionId = generateActionEntityId(
        pluginAddress,
        Address.fromString(daoId),
        pluginProposalId.toString(),
        index
      );

      const actionEntity = new Action(actionId);
      actionEntity.to = action.to;
      actionEntity.value = action.value;
      actionEntity.data = action.data;
      actionEntity.daoAddress = Bytes.fromHexString(daoId);
      actionEntity.proposal = proposalEntityId;
      actionEntity.save();
    }
    proposalEntity.isSignaling = actions.length == 0;

    // totalVotingPower
    proposalEntity.totalVotingPower = contract.try_totalVotingPower(
      parameters.snapshotBlock
    ).value;
  }

  proposalEntity.save();

  // update vote length
  const pluginEntity = TokenVotingPlugin.load(pluginEntityId);
  if (pluginEntity) {
    const voteLength = contract.try_proposalCount();
    if (!voteLength.reverted) {
      pluginEntity.proposalCount = voteLength.value;
      pluginEntity.save();
    }
  }
}

export function handleVoteCast(event: VoteCast): void {
  const pluginAddress = event.address;
  const voterAddress = event.params.voter;
  const voterEntityId = generateMemberEntityId(pluginAddress, voterAddress);
  const pluginProposalId = event.params.proposalId;
  const proposalEntityId = generateProposalEntityId(
    pluginAddress,
    pluginProposalId
  );
  const pluginEntityId = generatePluginEntityId(pluginAddress);
  const voterVoteEntityId = generateVoteEntityId(
    voterAddress,
    proposalEntityId
  );
  const voteOption = VOTER_OPTIONS.get(event.params.voteOption);

  if (voteOption === 'None') {
    return;
  }

  let voterProposalVoteEntity = TokenVotingVote.load(voterVoteEntityId);
  if (!voterProposalVoteEntity) {
    voterProposalVoteEntity = new TokenVotingVote(voterVoteEntityId);
    voterProposalVoteEntity.voter = voterEntityId;
    voterProposalVoteEntity.proposal = proposalEntityId;
    voterProposalVoteEntity.createdAt = event.block.timestamp;
    voterProposalVoteEntity.voteReplaced = false;
    voterProposalVoteEntity.updatedAt = BigInt.zero();
  } else {
    voterProposalVoteEntity.voteReplaced = true;
    voterProposalVoteEntity.updatedAt = event.block.timestamp;
  }
  voterProposalVoteEntity.voteOption = voteOption as string;
  voterProposalVoteEntity.votingPower = event.params.votingPower;
  voterProposalVoteEntity.save();

  // voter
  let voterEntity = TokenVotingVoter.load(voterEntityId);
  if (!voterEntity) {
    voterEntity = new TokenVotingVoter(voterEntityId);
    voterEntity.address = voterAddress.toHexString();
    voterEntity.plugin = pluginEntityId;
    voterEntity.lastUpdated = event.block.timestamp;
    voterEntity.save();
  } else {
    voterEntity.lastUpdated = event.block.timestamp;
    voterEntity.save();
  }

  // update count
  const proposalEntity = TokenVotingProposal.load(proposalEntityId);
  if (proposalEntity) {
    const contract = TokenVoting.bind(pluginAddress);
    const proposal = contract.try_getProposal(pluginProposalId);

    if (!proposal.reverted) {
      const parameters = proposal.value.value2;
      const tally = proposal.value.value3;
      const totalVotingPowerCall = contract.try_totalVotingPower(
        parameters.snapshotBlock
      );

      if (!totalVotingPowerCall.reverted) {
        const abstain = tally.abstain;
        const yes = tally.yes;
        const no = tally.no;
        const castedVotingPower = yes.plus(no).plus(abstain);
        const totalVotingPower = totalVotingPowerCall.value;
        const noVotesWorstCase = totalVotingPower.minus(yes).minus(abstain);

        const supportThreshold = parameters.supportThreshold;
        const minVotingPower = parameters.minVotingPower;

        const BASE = BigInt.fromString(RATIO_BASE);

        proposalEntity.yes = yes;
        proposalEntity.no = no;
        proposalEntity.abstain = abstain;
        proposalEntity.castedVotingPower = castedVotingPower;

        // check if the current vote results meet the conditions for the proposal to pass:

        // `(1 - supportThreshold) * N_yes > supportThreshold *  N_no,worst-case`
        const supportThresholdReachedEarly = BASE.minus(supportThreshold)
          .times(yes)
          .gt(supportThreshold.times(noVotesWorstCase));

        // `(1 - supportThreshold) * N_yes > supportThreshold *  N_no
        const supportThresholdReached = BASE.minus(supportThreshold)
          .times(yes)
          .gt(supportThreshold.times(no));

        // `N_yes + N_no + N_abstain >= minVotingPower = minParticipation * N_total`
        const minParticipationReached = castedVotingPower.ge(minVotingPower);

        // Used when proposal has ended.
        proposalEntity.approvalReached =
          supportThresholdReached && minParticipationReached;

        // Used when proposal has not ended.
        proposalEntity.earlyExecutable =
          supportThresholdReachedEarly &&
          minParticipationReached &&
          proposalEntity.votingMode === VOTING_MODES.get(1);
      }
      proposalEntity.save();
    }
  }
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  const pluginProposalId = event.params.proposalId;
  const proposalEntityId = generateProposalEntityId(
    event.address,
    pluginProposalId
  );

  const proposalEntity = TokenVotingProposal.load(proposalEntityId);
  if (proposalEntity) {
    proposalEntity.executed = true;
    proposalEntity.approvalReached = false;
    proposalEntity.executionDate = event.block.timestamp;
    proposalEntity.executionBlockNumber = event.block.number;
    proposalEntity.executionTxHash = event.transaction.hash;
    proposalEntity.save();
  }
}

export function handleVotingSettingsUpdated(
  event: VotingSettingsUpdated
): void {
  const pluginEntity = TokenVotingPlugin.load(
    generatePluginEntityId(event.address)
  );
  if (pluginEntity) {
    let votingModeIndex = event.params.votingMode;
    pluginEntity.votingModeIndex = votingModeIndex;
    if (!VOTING_MODES.has(votingModeIndex)) {
      // if the voting mode is not defined, set it to 'Undefined'
      votingModeIndex = VOTING_MODE_UNDEFINED;
    }

    pluginEntity.votingMode = VOTING_MODES.get(votingModeIndex) as string;
    pluginEntity.supportThreshold = event.params.supportThreshold;
    pluginEntity.minParticipation = event.params.minParticipation;
    pluginEntity.minDuration = event.params.minDuration;
    pluginEntity.minProposerVotingPower = event.params.minProposerVotingPower;
    pluginEntity.save();
  }
}

export function handleMembershipContractAnnounced(
  event: MembershipContractAnnounced
): void {
  const token = event.params.definingContract;
  const pluginEntityId = generatePluginEntityId(event.address);
  const pluginEntity = TokenVotingPlugin.load(pluginEntityId);

  if (pluginEntity) {
    const tokenAddress = identifyAndFetchOrCreateERC20TokenEntity(token);
    if (!tokenAddress) {
      return;
    }
    pluginEntity.token = tokenAddress as string;
    pluginEntity.save();

    // Both GovernanceWrappedERC20/GovernanceERC20 use the `Transfer` event, so
    // It's safe to create the same type of template for them.
    const context = new DataSourceContext();
    context.setString('pluginId', pluginEntityId);
    GovernanceERC20.createWithContext(event.params.definingContract, context);
  }
}
