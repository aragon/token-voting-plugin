# Solidity API

## VotingPowerCondition

Checks if an account's voting power or token balance meets the threshold set
in an associated TokenVoting plugin.

### constructor

```solidity
constructor(address _tokenVoting) public
```

Initializes the contract with the `TokenVoting` plugin address and fetches the associated token.

#### Parameters

| Name          | Type    | Description                              |
| ------------- | ------- | ---------------------------------------- |
| \_tokenVoting | address | The address of the `TokenVoting` plugin. |

### isGranted

```solidity
function isGranted(address _where, address _who, bytes32 _permissionId, bytes _data) public view returns (bool)
```

Checks if a call is permitted.

_The function checks both the voting power and token balance to ensure `_who` meets the minimum voting
threshold defined in the `TokenVoting` plugin. Returns `false` if the minimum requirement is unmet._

#### Parameters

| Name           | Type    | Description                                                          |
| -------------- | ------- | -------------------------------------------------------------------- |
| \_where        | address | The address of the target contract.                                  |
| \_who          | address | The address (EOA or contract) for which the permissions are checked. |
| \_permissionId | bytes32 | The permission identifier.                                           |
| \_data         | bytes   | Optional data passed to the `PermissionCondition` implementation.    |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0]  | bool |             |
