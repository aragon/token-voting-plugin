# Solidity API

## TokenVoting

The majority voting implementation using an
[OpenZeppelin `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes)
compatible governance token.

_v1.3 (Release 1, Build 3). For each upgrade, if the reinitialization step is required,
increment the version numbers in the modifier for both the initialize and initializeFrom functions._

### TOKEN_VOTING_INTERFACE_ID

```solidity
bytes4 TOKEN_VOTING_INTERFACE_ID
```

The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.

### NoVotingPower

```solidity
error NoVotingPower()
```

Thrown if the voting power is zero

### initialize

```solidity
function initialize(contract IDAO _dao, struct MajorityVotingBase.VotingSettings _votingSettings, contract IVotesUpgradeable _token, struct IPlugin.TargetConfig _targetConfig, uint256 _minApprovals, bytes _pluginMetadata) external
```

Initializes the component.

_This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822)._

#### Parameters

| Name             | Type                                     | Description                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| \_dao            | contract IDAO                            | The IDAO interface of the associated DAO.                                                                                                                                                                                                        |
| \_votingSettings | struct MajorityVotingBase.VotingSettings | The voting settings.                                                                                                                                                                                                                             |
| \_token          | contract IVotesUpgradeable               | The [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token used for voting.                                                                                                                                                                       |
| \_targetConfig   | struct IPlugin.TargetConfig              | Configuration for the execution target, specifying the target address and operation type (either `Call` or `DelegateCall`). Defined by `TargetConfig` in the `IPlugin` interface, part of the `osx-commons-contracts` package, added in build 3. |
| \_minApprovals   | uint256                                  | The minimal amount of approvals the proposal needs to succeed.                                                                                                                                                                                   |
| \_pluginMetadata | bytes                                    | The plugin specific information encoded in bytes. This can also be an ipfs cid encoded in bytes.                                                                                                                                                 |

### initializeFrom

```solidity
function initializeFrom(uint16 _fromBuild, bytes _initData) external
```

Reinitializes the TokenVoting after an upgrade from a previous build version. For each
reinitialization step, use the `_fromBuild` version to decide which internal functions to
call for reinitialization.

_WARNING: The contract should only be upgradeable through PSP to ensure that \_fromBuild is not
incorrectly passed, and that the appropriate permissions for the upgrade are properly configured._

#### Parameters

| Name        | Type   | Description                                                                                                                                            |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| \_fromBuild | uint16 | Build version number of previous implementation contract this upgrade is transitioning from.                                                           |
| \_initData  | bytes  | The initialization data to be passed to via `upgradeToAndCall` (see [ERC-1967](https://docs.openzeppelin.com/contracts/4.x/api/proxy#ERC1967Upgrade)). |

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

### getVotingToken

```solidity
function getVotingToken() public view returns (contract IVotesUpgradeable)
```

getter function for the voting token.

_public function also useful for registering interfaceId
and for distinguishing from majority voting interface._

#### Return Values

| Name | Type                       | Description                |
| ---- | -------------------------- | -------------------------- |
| [0]  | contract IVotesUpgradeable | The token used for voting. |

### totalVotingPower

```solidity
function totalVotingPower(uint256 _blockNumber) public view returns (uint256)
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

### createProposal

```solidity
function createProposal(bytes _metadata, struct Action[] _actions, uint256 _allowFailureMap, uint64 _startDate, uint64 _endDate, enum IMajorityVoting.VoteOption _voteOption, bool _tryEarlyExecution) public returns (uint256 proposalId)
```

Creates a new majority voting proposal.

_Requires the `CREATE_PROPOSAL_PERMISSION_ID` permission._

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

### createProposal

```solidity
function createProposal(bytes _metadata, struct Action[] _actions, uint64 _startDate, uint64 _endDate, bytes _data) external returns (uint256 proposalId)
```

Creates a new proposal.

#### Parameters

| Name        | Type            | Description                                                       |
| ----------- | --------------- | ----------------------------------------------------------------- |
| \_metadata  | bytes           | The metadata of the proposal.                                     |
| \_actions   | struct Action[] | The actions that will be executed after the proposal passes.      |
| \_startDate | uint64          | The start date of the proposal.                                   |
| \_endDate   | uint64          | The end date of the proposal.                                     |
| \_data      | bytes           | The additional abi-encoded data to include more necessary fields. |

#### Return Values

| Name       | Type    | Description             |
| ---------- | ------- | ----------------------- |
| proposalId | uint256 | The id of the proposal. |

### customProposalParamsABI

```solidity
function customProposalParamsABI() external pure returns (string)
```

The human-readable abi format for extra params included in `data` of `createProposal`.

_Used for UI to easily detect what extra params the contract expects._

#### Return Values

| Name | Type   | Description                                  |
| ---- | ------ | -------------------------------------------- |
| [0]  | string | ABI of params in `data` of `createProposal`. |

### isMember

```solidity
function isMember(address _account) external view returns (bool)
```

Checks if an account is a member of the DAO.

_This function must be implemented in the plugin contract that introduces the members to the DAO._

#### Parameters

| Name      | Type    | Description                               |
| --------- | ------- | ----------------------------------------- |
| \_account | address | The address of the account to be checked. |

#### Return Values

| Name | Type | Description                             |
| ---- | ---- | --------------------------------------- |
| [0]  | bool | Whether the account is a member or not. |

### \_vote

```solidity
function _vote(uint256 _proposalId, enum IMajorityVoting.VoteOption _voteOption, address _voter, bool _tryEarlyExecution) internal
```

Internal function to cast a vote. It assumes the queried proposal exists.

#### Parameters

| Name                | Type                            | Description                                                                                                           |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| \_proposalId        | uint256                         | The ID of the proposal.                                                                                               |
| \_voteOption        | enum IMajorityVoting.VoteOption | The chosen vote option to be casted on the proposal vote.                                                             |
| \_voter             | address                         | The address of the account that is voting on the `_proposalId`.                                                       |
| \_tryEarlyExecution | bool                            | If `true`, early execution is tried after the vote cast. The call does not revert if early execution is not possible. |

### \_canVote

```solidity
function _canVote(uint256 _proposalId, address _account, enum IMajorityVoting.VoteOption _voteOption) internal view returns (bool)
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
