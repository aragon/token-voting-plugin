# Solidity API

## IMajorityVoting

The interface of majority voting plugin.

### VoteOption

```solidity
enum VoteOption {
  None,
  Abstain,
  Yes,
  No
}
```

### VoteCast

```solidity
event VoteCast(uint256 proposalId, address voter, enum IMajorityVoting.VoteOption voteOption, uint256 votingPower)
```

Emitted when a vote is cast by a voter.

#### Parameters

| Name        | Type                            | Description                        |
| ----------- | ------------------------------- | ---------------------------------- |
| proposalId  | uint256                         | The ID of the proposal.            |
| voter       | address                         | The voter casting the vote.        |
| voteOption  | enum IMajorityVoting.VoteOption | The casted vote option.            |
| votingPower | uint256                         | The voting power behind this vote. |

### supportThreshold

```solidity
function supportThreshold() external view returns (uint32)
```

Returns the support threshold parameter stored in the voting settings.

#### Return Values

| Name | Type   | Description                      |
| ---- | ------ | -------------------------------- |
| [0]  | uint32 | The support threshold parameter. |

### minApproval

```solidity
function minApproval() external view returns (uint256)
```

Returns the configured minimum approval value.

#### Return Values

| Name | Type    | Description                 |
| ---- | ------- | --------------------------- |
| [0]  | uint256 | The minimal approval value. |

### minParticipation

```solidity
function minParticipation() external view returns (uint32)
```

Returns the minimum participation parameter stored in the voting settings.

#### Return Values

| Name | Type   | Description                          |
| ---- | ------ | ------------------------------------ |
| [0]  | uint32 | The minimum participation parameter. |

### isSupportThresholdReached

```solidity
function isSupportThresholdReached(uint256 _proposalId) external view returns (bool)
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
function isSupportThresholdReachedEarly(uint256 _proposalId) external view returns (bool)
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
function isMinParticipationReached(uint256 _proposalId) external view returns (bool)
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
function isMinApprovalReached(uint256 _proposalId) external view returns (bool)
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

### canVote

```solidity
function canVote(uint256 _proposalId, address _account, enum IMajorityVoting.VoteOption _voteOption) external view returns (bool)
```

Checks if an account can participate on a proposal. This can be because the vote

- has not started,
- has ended,
- was executed, or
- the voter doesn't have voting powers.

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
function canExecute(uint256 _proposalId) external view returns (bool)
```

Checks if a proposal can be executed.

#### Parameters

| Name         | Type    | Description                           |
| ------------ | ------- | ------------------------------------- |
| \_proposalId | uint256 | The ID of the proposal to be checked. |

#### Return Values

| Name | Type | Description                                            |
| ---- | ---- | ------------------------------------------------------ |
| [0]  | bool | True if the proposal can be executed, false otherwise. |

### vote

```solidity
function vote(uint256 _proposalId, enum IMajorityVoting.VoteOption _voteOption, bool _tryEarlyExecution) external
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
function execute(uint256 _proposalId) external
```

Executes a proposal.

#### Parameters

| Name         | Type    | Description                            |
| ------------ | ------- | -------------------------------------- |
| \_proposalId | uint256 | The ID of the proposal to be executed. |

### getVoteOption

```solidity
function getVoteOption(uint256 _proposalId, address _account) external view returns (enum IMajorityVoting.VoteOption)
```

Returns whether the account has voted for the proposal.

_May return `none` if the `_proposalId` does not exist,
or the `_account` does not have voting power._

#### Parameters

| Name         | Type    | Description                        |
| ------------ | ------- | ---------------------------------- |
| \_proposalId | uint256 | The ID of the proposal.            |
| \_account    | address | The account address to be checked. |

#### Return Values

| Name | Type                            | Description                                             |
| ---- | ------------------------------- | ------------------------------------------------------- |
| [0]  | enum IMajorityVoting.VoteOption | The vote option cast by a voter for a certain proposal. |
