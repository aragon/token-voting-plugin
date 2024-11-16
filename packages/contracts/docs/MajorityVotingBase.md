# Solidity API

## MajorityVotingBase

The abstract implementation of majority voting plugins.

### Parameterization

We define two parameters
$$\texttt{support} = \frac{N_\text{yes}}{N_\text{yes} + N_\text{no}} \in [0,1]$$
and
$$\texttt{participation} = \frac{N_\text{yes} + N_\text{no} + N_\text{abstain}}{N_\text{total}} \in [0,1],$$
where $N_\text{yes}$, $N_\text{no}$, and $N_\text{abstain}$ are the yes, no, and abstain votes that have been
cast and $N_\text{total}$ is the total voting power available at proposal creation time.

#### Limit Values: Support Threshold & Minimum Participation

Two limit values are associated with these parameters and decide if a proposal execution should be possible:
$\texttt{supportThreshold} \in [0,1)$ and $\texttt{minParticipation} \in [0,1]$.

For threshold values, $>$ comparison is used. This **does not** include the threshold value.
E.g., for $\texttt{supportThreshold} = 50\%$,
the criterion is fulfilled if there is at least one more yes than no votes ($N_\text{yes} = N_\text{no} + 1$).
For minimum values, $\ge{}$ comparison is used. This **does** include the minimum participation value.
E.g., for $\texttt{minParticipation} = 40\%$ and $N_\text{total} = 10$,
the criterion is fulfilled if 4 out of 10 votes were casted.

Majority voting implies that the support threshold is set with
$$\texttt{supportThreshold} \ge 50\% .$$
However, this is not enforced by the contract code and developers can make unsafe parameters and
only the frontend will warn about bad parameter settings.

### Execution Criteria

After the vote is closed, two criteria decide if the proposal passes.

#### The Support Criterion

For a proposal to pass, the required ratio of yes and no votes must be met:
$$(1- \texttt{supportThreshold}) \cdot N_\text{yes} > \texttt{supportThreshold} \cdot N_\text{no}.$$
Note, that the inequality yields the simple majority voting condition for $\texttt{supportThreshold}=\frac{1}{2}$.

#### The Participation Criterion

For a proposal to pass, the minimum voting power must have been cast:
$$N_\text{yes} + N_\text{no} + N_\text{abstain} \ge \texttt{minVotingPower},$$
where $\texttt{minVotingPower} = \texttt{minParticipation} \cdot N_\text{total}$.

### Vote Replacement

The contract allows votes to be replaced. Voters can vote multiple times
and only the latest voteOption is tallied.

### Early Execution

This contract allows a proposal to be executed early,
iff the vote outcome cannot change anymore by more people voting.
Accordingly, vote replacement and early execution are mutually exclusive options.
The outcome cannot change anymore
iff the support threshold is met even if all remaining votes are no votes.
We call this number the worst-case number of no votes and define it as

$$N_\text{no, worst-case} = N_\text{no} + \texttt{remainingVotes}$$

where

$$
\texttt{remainingVotes} =
N_\text{total}-\underbrace{(N_\text{yes}+N_\text{no}+N_\text{abstain})}_{\text{turnout}}.
$$

We can use this quantity to calculate the worst-case support that would be obtained
if all remaining votes are casted with no:

$$
\begin{align*}
  \texttt{worstCaseSupport}
  &= \frac{N_\text{yes}}{N_\text{yes} + (N_\text{no, worst-case})} \\[3mm]
  &= \frac{N_\text{yes}}{N_\text{yes} + (N_\text{no} + \texttt{remainingVotes})} \\[3mm]
  &= \frac{N_\text{yes}}{N_\text{yes} +  N_\text{no} + N_\text{total}
     - (N_\text{yes} + N_\text{no} + N_\text{abstain})} \\[3mm]
  &= \frac{N_\text{yes}}{N_\text{total} - N_\text{abstain}}
\end{align*}
$$

In analogy, we can modify [the support criterion](#the-support-criterion)
from above to allow for early execution:

$$
\begin{align*}
  (1 - \texttt{supportThreshold}) \cdot N_\text{yes}
  &> \texttt{supportThreshold} \cdot  N_\text{no, worst-case} \\[3mm]
  &> \texttt{supportThreshold} \cdot (N_\text{no} + \texttt{remainingVotes}) \\[3mm]
  &> \texttt{supportThreshold} \cdot (N_\text{no}
    + N_\text{total}-(N_\text{yes}+N_\text{no}+N_\text{abstain})) \\[3mm]
  &> \texttt{supportThreshold} \cdot (N_\text{total} - N_\text{yes} - N_\text{abstain})
\end{align*}
$$

Accordingly, early execution is possible when the vote is open,
the modified support criterion, and the particicpation criterion are met.

_This contract implements the `IMajorityVoting` interface._

### VotingMode

```solidity
enum VotingMode {
  Standard,
  EarlyExecution,
  VoteReplacement
}
```

### VotingSettings

```solidity
struct VotingSettings {
  enum MajorityVotingBase.VotingMode votingMode;
  uint32 supportThreshold;
  uint32 minParticipation;
  uint64 minDuration;
  uint256 minProposerVotingPower;
}
```

### Proposal

```solidity
struct Proposal {
  bool executed;
  struct MajorityVotingBase.ProposalParameters parameters;
  struct MajorityVotingBase.Tally tally;
  mapping(address => enum IMajorityVoting.VoteOption) voters;
  struct Action[] actions;
  uint256 allowFailureMap;
  uint256 minApprovalPower;
  struct IPlugin.TargetConfig targetConfig;
}
```

### ProposalParameters

```solidity
struct ProposalParameters {
  enum MajorityVotingBase.VotingMode votingMode;
  uint32 supportThreshold;
  uint64 startDate;
  uint64 endDate;
  uint64 snapshotBlock;
  uint256 minVotingPower;
}
```

### Tally

```solidity
struct Tally {
  uint256 abstain;
  uint256 yes;
  uint256 no;
}
```

### MAJORITY_VOTING_BASE_INTERFACE_ID

```solidity
bytes4 MAJORITY_VOTING_BASE_INTERFACE_ID
```

The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.

### UPDATE_VOTING_SETTINGS_PERMISSION_ID

```solidity
bytes32 UPDATE_VOTING_SETTINGS_PERMISSION_ID
```

The ID of the permission required to call the `updateVotingSettings` function.

### CREATE_PROPOSAL_PERMISSION_ID

```solidity
bytes32 CREATE_PROPOSAL_PERMISSION_ID
```

The ID of the permission required to call the `createProposal` functions.

### EXECUTE_PROPOSAL_PERMISSION_ID

```solidity
bytes32 EXECUTE_PROPOSAL_PERMISSION_ID
```

The ID of the permission required to call the `execute` function.

### proposals

```solidity
mapping(uint256 => struct MajorityVotingBase.Proposal) proposals
```

A mapping between proposal IDs and proposal information.

### DateOutOfBounds

```solidity
error DateOutOfBounds(uint64 limit, uint64 actual)
```

Thrown if a date is out of bounds.

#### Parameters

| Name   | Type   | Description       |
| ------ | ------ | ----------------- |
| limit  | uint64 | The limit value.  |
| actual | uint64 | The actual value. |

### MinDurationOutOfBounds

```solidity
error MinDurationOutOfBounds(uint64 limit, uint64 actual)
```

Thrown if the minimal duration value is out of bounds (less than one hour or greater than 1 year).

#### Parameters

| Name   | Type   | Description       |
| ------ | ------ | ----------------- |
| limit  | uint64 | The limit value.  |
| actual | uint64 | The actual value. |

### ProposalCreationForbidden

```solidity
error ProposalCreationForbidden(address sender)
```

Thrown when a sender is not allowed to create a proposal.

#### Parameters

| Name   | Type    | Description         |
| ------ | ------- | ------------------- |
| sender | address | The sender address. |

### NonexistentProposal

```solidity
error NonexistentProposal(uint256 proposalId)
```

Thrown when a proposal doesn't exist.

#### Parameters

| Name       | Type    | Description                                 |
| ---------- | ------- | ------------------------------------------- |
| proposalId | uint256 | The ID of the proposal which doesn't exist. |

### VoteCastForbidden

```solidity
error VoteCastForbidden(uint256 proposalId, address account, enum IMajorityVoting.VoteOption voteOption)
```

Thrown if an account is not allowed to cast a vote. This can be because the vote

- has not started,
- has ended,
- was executed, or
- the account doesn't have voting powers.

#### Parameters

| Name       | Type                            | Description                   |
| ---------- | ------------------------------- | ----------------------------- |
| proposalId | uint256                         | The ID of the proposal.       |
| account    | address                         | The address of the \_account. |
| voteOption | enum IMajorityVoting.VoteOption | The chosen vote option.       |

### ProposalExecutionForbidden

```solidity
error ProposalExecutionForbidden(uint256 proposalId)
```

Thrown if the proposal execution is forbidden.

#### Parameters

| Name       | Type    | Description             |
| ---------- | ------- | ----------------------- |
| proposalId | uint256 | The ID of the proposal. |

### ProposalAlreadyExists

```solidity
error ProposalAlreadyExists(uint256 proposalId)
```

Thrown if the proposal with same actions and metadata already exists.

#### Parameters

| Name       | Type    | Description             |
| ---------- | ------- | ----------------------- |
| proposalId | uint256 | The id of the proposal. |

### VotingSettingsUpdated

```solidity
event VotingSettingsUpdated(enum MajorityVotingBase.VotingMode votingMode, uint32 supportThreshold, uint32 minParticipation, uint64 minDuration, uint256 minProposerVotingPower)
```

Emitted when the voting settings are updated.

#### Parameters

| Name                   | Type                               | Description                                             |
| ---------------------- | ---------------------------------- | ------------------------------------------------------- |
| votingMode             | enum MajorityVotingBase.VotingMode | A parameter to select the vote mode.                    |
| supportThreshold       | uint32                             | The support threshold value.                            |
| minParticipation       | uint32                             | The minimum participation value.                        |
| minDuration            | uint64                             | The minimum duration of the proposal vote in seconds.   |
| minProposerVotingPower | uint256                            | The minimum voting power required to create a proposal. |

### VotingMinApprovalUpdated

```solidity
event VotingMinApprovalUpdated(uint256 minApprovals)
```

Emitted when the min approval value is updated.

#### Parameters

| Name         | Type    | Description                                                    |
| ------------ | ------- | -------------------------------------------------------------- |
| minApprovals | uint256 | The minimum amount of yes votes needed for a proposal succeed. |

### \_\_MajorityVotingBase_init

```solidity
function __MajorityVotingBase_init(contract IDAO _dao, struct MajorityVotingBase.VotingSettings _votingSettings, struct IPlugin.TargetConfig _targetConfig, uint256 _minApprovals, bytes _pluginMetadata) internal
```

Initializes the component to be used by inheriting contracts.

_This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822)._

#### Parameters

| Name             | Type                                     | Description                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| \_dao            | contract IDAO                            | The IDAO interface of the associated DAO.                                                                                                                                                                                                        |
| \_votingSettings | struct MajorityVotingBase.VotingSettings | The voting settings.                                                                                                                                                                                                                             |
| \_targetConfig   | struct IPlugin.TargetConfig              | Configuration for the execution target, specifying the target address and operation type (either `Call` or `DelegateCall`). Defined by `TargetConfig` in the `IPlugin` interface, part of the `osx-commons-contracts` package, added in build 3. |
| \_minApprovals   | uint256                                  | The minimal amount of approvals the proposal needs to succeed.                                                                                                                                                                                   |
| \_pluginMetadata | bytes                                    | The plugin specific information encoded in bytes. This can also be an ipfs cid encoded in bytes.                                                                                                                                                 |

### supportsInterface

```solidity
function supportsInterface(bytes4 _interfaceId) public view virtual returns (bool)
```

Checks if this or the parent contract supports an interface by its ID.

#### Parameters

| Name          | Type   | Description              |
| ------------- | ------ | ------------------------ |
| \_interfaceId | bytes4 | The ID of the interface. |

#### Return Values

| Name | Type | Description                                   |
| ---- | ---- | --------------------------------------------- |
| [0]  | bool | Returns `true` if the interface is supported. |

### vote

```solidity
function vote(uint256 _proposalId, enum IMajorityVoting.VoteOption _voteOption, bool _tryEarlyExecution) public virtual
```

Votes on a proposal and, optionally, executes the proposal.

_`_voteOption`, 1 -> abstain, 2 -> yes, 3 -> no_

#### Parameters

| Name                | Type                            | Description                                                                                                           |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| \_proposalId        | uint256                         | The ID of the proposal.                                                                                               |
| \_voteOption        | enum IMajorityVoting.VoteOption | The chosen vote option.                                                                                               |
| \_tryEarlyExecution | bool                            | If `true`, early execution is tried after the vote cast. The call does not revert if early execution is not possible. |

### execute

```solidity
function execute(uint256 _proposalId) public virtual
```

Executes a proposal.

_Requires the `EXECUTE_PROPOSAL_PERMISSION_ID` permission._

#### Parameters

| Name         | Type    | Description                            |
| ------------ | ------- | -------------------------------------- |
| \_proposalId | uint256 | The ID of the proposal to be executed. |

### getVoteOption

```solidity
function getVoteOption(uint256 _proposalId, address _voter) public view virtual returns (enum IMajorityVoting.VoteOption)
```

Returns whether the account has voted for the proposal.

_May return `none` if the `_proposalId` does not exist,
or the `_account` does not have voting power._

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |
| \_voter      | address |                         |

#### Return Values

| Name | Type                            | Description                                             |
| ---- | ------------------------------- | ------------------------------------------------------- |
| [0]  | enum IMajorityVoting.VoteOption | The vote option cast by a voter for a certain proposal. |

### canVote

```solidity
function canVote(uint256 _proposalId, address _account, enum IMajorityVoting.VoteOption _voteOption) public view virtual returns (bool)
```

Checks if an account can participate on a proposal. This can be because the vote

- has not started,
- has ended,
- was executed, or
- the voter doesn't have voting powers.

_Reverts if the proposal with the given `_proposalId` does not exist._

#### Parameters

| Name         | Type                            | Description                                                   |
| ------------ | ------------------------------- | ------------------------------------------------------------- |
| \_proposalId | uint256                         | The proposal Id.                                              |
| \_account    | address                         | The account address to be checked.                            |
| \_voteOption | enum IMajorityVoting.VoteOption | Whether the voter abstains, supports or opposes the proposal. |

#### Return Values

| Name | Type | Description                                     |
| ---- | ---- | ----------------------------------------------- |
| [0]  | bool | Returns true if the account is allowed to vote. |

### canExecute

```solidity
function canExecute(uint256 _proposalId) public view virtual returns (bool)
```

Checks if a proposal can be executed.

_Reverts if the proposal with the given `_proposalId` does not exist._

#### Parameters

| Name         | Type    | Description                           |
| ------------ | ------- | ------------------------------------- |
| \_proposalId | uint256 | The ID of the proposal to be checked. |

#### Return Values

| Name | Type | Description                                            |
| ---- | ---- | ------------------------------------------------------ |
| [0]  | bool | True if the proposal can be executed, false otherwise. |

### hasSucceeded

```solidity
function hasSucceeded(uint256 _proposalId) public view virtual returns (bool)
```

Whether proposal succeeded or not.

_Reverts if the proposal with the given `_proposalId` does not exist._

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The id of the proposal. |

#### Return Values

| Name | Type | Description                                                                         |
| ---- | ---- | ----------------------------------------------------------------------------------- |
| [0]  | bool | Returns if proposal has been succeeded or not without including time window checks. |

### isSupportThresholdReached

```solidity
function isSupportThresholdReached(uint256 _proposalId) public view virtual returns (bool)
```

Checks if the support value defined as:
$$\texttt{support} = \frac{N_\text{yes}}{N_\text{yes}+N_\text{no}}$$
for a proposal is greater than the support threshold.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name | Type | Description                                                                                |
| ---- | ---- | ------------------------------------------------------------------------------------------ |
| [0]  | bool | Returns `true` if the support is greater than the support threshold and `false` otherwise. |

### isSupportThresholdReachedEarly

```solidity
function isSupportThresholdReachedEarly(uint256 _proposalId) public view virtual returns (bool)
```

Checks if the worst-case support value defined as:
$$\texttt{worstCaseSupport} = \frac{N_\text{yes}}{ N_\text{total}-N_\text{abstain}}$$
for a proposal is greater than the support threshold.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name | Type | Description                                                                                           |
| ---- | ---- | ----------------------------------------------------------------------------------------------------- |
| [0]  | bool | Returns `true` if the worst-case support is greater than the support threshold and `false` otherwise. |

### isMinParticipationReached

```solidity
function isMinParticipationReached(uint256 _proposalId) public view virtual returns (bool)
```

Checks if the participation value defined as:
$$\texttt{participation} = \frac{N_\text{yes}+N_\text{no}+N_\text{abstain}}{N_\text{total}}$$
for a proposal is greater or equal than the minimum participation value.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name | Type | Description                                                                                                    |
| ---- | ---- | -------------------------------------------------------------------------------------------------------------- |
| [0]  | bool | Returns `true` if the participation is greater or equal than the minimum participation, and `false` otherwise. |

### isMinApprovalReached

```solidity
function isMinApprovalReached(uint256 _proposalId) public view virtual returns (bool)
```

Checks if the min approval value defined as:
$$\texttt{minApproval} = \frac{N_\text{yes}}{N_\text{total}}$$
for a proposal is greater or equal than the minimum approval value.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name | Type | Description                                                                                          |
| ---- | ---- | ---------------------------------------------------------------------------------------------------- |
| [0]  | bool | Returns `true` if the approvals is greater or equal than the minimum approval and `false` otherwise. |

### minApproval

```solidity
function minApproval() public view virtual returns (uint256)
```

Returns the configured minimum approval value.

#### Return Values

| Name | Type    | Description                 |
| ---- | ------- | --------------------------- |
| [0]  | uint256 | The minimal approval value. |

### supportThreshold

```solidity
function supportThreshold() public view virtual returns (uint32)
```

Returns the support threshold parameter stored in the voting settings.

#### Return Values

| Name | Type   | Description                      |
| ---- | ------ | -------------------------------- |
| [0]  | uint32 | The support threshold parameter. |

### minParticipation

```solidity
function minParticipation() public view virtual returns (uint32)
```

Returns the minimum participation parameter stored in the voting settings.

#### Return Values

| Name | Type   | Description                          |
| ---- | ------ | ------------------------------------ |
| [0]  | uint32 | The minimum participation parameter. |

### minDuration

```solidity
function minDuration() public view virtual returns (uint64)
```

Returns the minimum duration parameter stored in the voting settings.

#### Return Values

| Name | Type   | Description                     |
| ---- | ------ | ------------------------------- |
| [0]  | uint64 | The minimum duration parameter. |

### minProposerVotingPower

```solidity
function minProposerVotingPower() public view virtual returns (uint256)
```

Returns the minimum voting power required to create a proposal stored in the voting settings.

#### Return Values

| Name | Type    | Description                                             |
| ---- | ------- | ------------------------------------------------------- |
| [0]  | uint256 | The minimum voting power required to create a proposal. |

### votingMode

```solidity
function votingMode() public view virtual returns (enum MajorityVotingBase.VotingMode)
```

Returns the vote mode stored in the voting settings.

#### Return Values

| Name | Type                               | Description              |
| ---- | ---------------------------------- | ------------------------ |
| [0]  | enum MajorityVotingBase.VotingMode | The vote mode parameter. |

### totalVotingPower

```solidity
function totalVotingPower(uint256 _blockNumber) public view virtual returns (uint256)
```

Returns the total voting power checkpointed for a specific block number.

#### Parameters

| Name          | Type    | Description       |
| ------------- | ------- | ----------------- |
| \_blockNumber | uint256 | The block number. |

#### Return Values

| Name | Type    | Description             |
| ---- | ------- | ----------------------- |
| [0]  | uint256 | The total voting power. |

### getProposal

```solidity
function getProposal(uint256 _proposalId) public view virtual returns (bool open, bool executed, struct MajorityVotingBase.ProposalParameters parameters, struct MajorityVotingBase.Tally tally, struct Action[] actions, uint256 allowFailureMap)
```

Returns all information for a proposal by its ID.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name            | Type                                         | Description                                                                              |
| --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| open            | bool                                         | Whether the proposal is open or not.                                                     |
| executed        | bool                                         | Whether the proposal is executed or not.                                                 |
| parameters      | struct MajorityVotingBase.ProposalParameters | The parameters of the proposal.                                                          |
| tally           | struct MajorityVotingBase.Tally              | The current tally of the proposal.                                                       |
| actions         | struct Action[]                              | The actions to be executed in the associated DAO after the proposal has passed.          |
| allowFailureMap | uint256                                      | The bit map representations of which actions are allowed to revert so tx still succeeds. |

### updateVotingSettings

```solidity
function updateVotingSettings(struct MajorityVotingBase.VotingSettings _votingSettings) external virtual
```

Updates the voting settings.

_Requires the `UPDATE_VOTING_SETTINGS_PERMISSION_ID` permission._

#### Parameters

| Name             | Type                                     | Description              |
| ---------------- | ---------------------------------------- | ------------------------ |
| \_votingSettings | struct MajorityVotingBase.VotingSettings | The new voting settings. |

### updateMinApprovals

```solidity
function updateMinApprovals(uint256 _minApprovals) external virtual
```

Updates the minimal approval value.

_Requires the `UPDATE_VOTING_SETTINGS_PERMISSION_ID` permission._

#### Parameters

| Name           | Type    | Description                     |
| -------------- | ------- | ------------------------------- |
| \_minApprovals | uint256 | The new minimal approval value. |

### createProposal

```solidity
function createProposal(bytes _metadata, struct Action[] _actions, uint256 _allowFailureMap, uint64 _startDate, uint64 _endDate, enum IMajorityVoting.VoteOption _voteOption, bool _tryEarlyExecution) external virtual returns (uint256 proposalId)
```

Creates a new majority voting proposal.

#### Parameters

| Name                | Type                            | Description                                                                                                                                                                                                      |
| ------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_metadata          | bytes                           | The metadata of the proposal.                                                                                                                                                                                    |
| \_actions           | struct Action[]                 | The actions that will be executed after the proposal passes.                                                                                                                                                     |
| \_allowFailureMap   | uint256                         | Allows proposal to succeed even if an action reverts. Uses bitmap representation. If the bit at index `x` is 1, the tx succeeds even if the action at `x` failed. Passing 0 will be treated as atomic execution. |
| \_startDate         | uint64                          | The start date of the proposal vote. If 0, the current timestamp is used and the vote starts immediately.                                                                                                        |
| \_endDate           | uint64                          | The end date of the proposal vote. If 0, `_startDate + minDuration` is used.                                                                                                                                     |
| \_voteOption        | enum IMajorityVoting.VoteOption | The chosen vote option to be casted on proposal creation.                                                                                                                                                        |
| \_tryEarlyExecution | bool                            | If `true`, early execution is tried after the vote cast. The call does not revert if early execution is not possible.                                                                                            |

#### Return Values

| Name       | Type    | Description             |
| ---------- | ------- | ----------------------- |
| proposalId | uint256 | The ID of the proposal. |

### \_vote

```solidity
function _vote(uint256 _proposalId, enum IMajorityVoting.VoteOption _voteOption, address _voter, bool _tryEarlyExecution) internal virtual
```

Internal function to cast a vote. It assumes the queried proposal exists.

#### Parameters

| Name                | Type                            | Description                                                                                                           |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| \_proposalId        | uint256                         | The ID of the proposal.                                                                                               |
| \_voteOption        | enum IMajorityVoting.VoteOption | The chosen vote option to be casted on the proposal vote.                                                             |
| \_voter             | address                         | The address of the account that is voting on the `_proposalId`.                                                       |
| \_tryEarlyExecution | bool                            | If `true`, early execution is tried after the vote cast. The call does not revert if early execution is not possible. |

### \_execute

```solidity
function _execute(uint256 _proposalId) internal virtual
```

Internal function to execute a proposal. It assumes the queried proposal exists.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

### \_canVote

```solidity
function _canVote(uint256 _proposalId, address _account, enum IMajorityVoting.VoteOption _voteOption) internal view virtual returns (bool)
```

Internal function to check if a voter can vote. It assumes the queried proposal exists.

#### Parameters

| Name         | Type                            | Description                                                   |
| ------------ | ------------------------------- | ------------------------------------------------------------- |
| \_proposalId | uint256                         | The ID of the proposal.                                       |
| \_account    | address                         | The address of the voter to check.                            |
| \_voteOption | enum IMajorityVoting.VoteOption | Whether the voter abstains, supports or opposes the proposal. |

#### Return Values

| Name | Type | Description                                                                             |
| ---- | ---- | --------------------------------------------------------------------------------------- |
| [0]  | bool | Returns `true` if the given voter can vote on a certain proposal and `false` otherwise. |

### \_hasSucceeded

```solidity
function _hasSucceeded(uint256 _proposalId) internal view virtual returns (bool)
```

An internal function that checks if the proposal succeeded or not.

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name | Type | Description                                                                            |
| ---- | ---- | -------------------------------------------------------------------------------------- |
| [0]  | bool | Returns `true` if the proposal succeeded depending on the thresholds and voting modes. |

### \_canExecute

```solidity
function _canExecute(uint256 _proposalId) internal view virtual returns (bool)
```

Internal function to check if a proposal can be executed. It assumes the queried proposal exists.

_Threshold and minimal values are compared with `>` and `>=` comparators, respectively._

#### Parameters

| Name         | Type    | Description             |
| ------------ | ------- | ----------------------- |
| \_proposalId | uint256 | The ID of the proposal. |

#### Return Values

| Name | Type | Description                                            |
| ---- | ---- | ------------------------------------------------------ |
| [0]  | bool | True if the proposal can be executed, false otherwise. |

### \_isProposalOpen

```solidity
function _isProposalOpen(struct MajorityVotingBase.Proposal proposal_) internal view virtual returns (bool)
```

Internal function to check if a proposal is still open.

#### Parameters

| Name       | Type                               | Description          |
| ---------- | ---------------------------------- | -------------------- |
| proposal\_ | struct MajorityVotingBase.Proposal | The proposal struct. |

#### Return Values

| Name | Type | Description                                    |
| ---- | ---- | ---------------------------------------------- |
| [0]  | bool | True if the proposal is open, false otherwise. |

### \_updateVotingSettings

```solidity
function _updateVotingSettings(struct MajorityVotingBase.VotingSettings _votingSettings) internal virtual
```

Internal function to update the plugin-wide proposal settings.

#### Parameters

| Name             | Type                                     | Description                                      |
| ---------------- | ---------------------------------------- | ------------------------------------------------ |
| \_votingSettings | struct MajorityVotingBase.VotingSettings | The voting settings to be validated and updated. |

### \_updateMinApprovals

```solidity
function _updateMinApprovals(uint256 _minApprovals) internal virtual
```

Internal function to update minimal approval value.

#### Parameters

| Name           | Type    | Description                     |
| -------------- | ------- | ------------------------------- |
| \_minApprovals | uint256 | The new minimal approval value. |

### \_validateProposalDates

```solidity
function _validateProposalDates(uint64 _start, uint64 _end) internal view virtual returns (uint64 startDate, uint64 endDate)
```

Validates and returns the proposal dates.

#### Parameters

| Name    | Type   | Description                                                                                          |
| ------- | ------ | ---------------------------------------------------------------------------------------------------- |
| \_start | uint64 | The start date of the proposal. If 0, the current timestamp is used and the vote starts immediately. |
| \_end   | uint64 | The end date of the proposal. If 0, `_start + minDuration` is used.                                  |

#### Return Values

| Name      | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| startDate | uint64 | The validated start date of the proposal. |
| endDate   | uint64 | The validated end date of the proposal.   |
