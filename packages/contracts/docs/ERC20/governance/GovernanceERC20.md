# Solidity API

## GovernanceERC20

An [OpenZeppelin `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes)
compatible [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token, used for voting and managed by a DAO.

### MINT_PERMISSION_ID

```solidity
bytes32 MINT_PERMISSION_ID
```

The permission identifier to mint new tokens

### MintSettings

```solidity
struct MintSettings {
  address[] receivers;
  uint256[] amounts;
}
```

### MintSettingsArrayLengthMismatch

```solidity
error MintSettingsArrayLengthMismatch(uint256 receiversArrayLength, uint256 amountsArrayLength)
```

Thrown if the number of receivers and amounts specified in the mint settings do not match.

#### Parameters

| Name                 | Type    | Description                          |
| -------------------- | ------- | ------------------------------------ |
| receiversArrayLength | uint256 | The length of the `receivers` array. |
| amountsArrayLength   | uint256 | The length of the `amounts` array.   |

### constructor

```solidity
constructor(contract IDAO _dao, string _name, string _symbol, struct GovernanceERC20.MintSettings _mintSettings) public
```

Calls the initialize function.

#### Parameters

| Name           | Type                                | Description                                                                         |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| \_dao          | contract IDAO                       | The managing DAO.                                                                   |
| \_name         | string                              | The name of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.   |
| \_symbol       | string                              | The symbol of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token. |
| \_mintSettings | struct GovernanceERC20.MintSettings | The token mint settings struct containing the `receivers` and `amounts`.            |

### initialize

```solidity
function initialize(contract IDAO _dao, string _name, string _symbol, struct GovernanceERC20.MintSettings _mintSettings) public
```

Initializes the contract and mints tokens to a list of receivers.

#### Parameters

| Name           | Type                                | Description                                                                         |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| \_dao          | contract IDAO                       | The managing DAO.                                                                   |
| \_name         | string                              | The name of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.   |
| \_symbol       | string                              | The symbol of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token. |
| \_mintSettings | struct GovernanceERC20.MintSettings | The token mint settings struct containing the `receivers` and `amounts`.            |

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

### mint

```solidity
function mint(address to, uint256 amount) external
```

Mints tokens to an address.

#### Parameters

| Name   | Type    | Description                        |
| ------ | ------- | ---------------------------------- |
| to     | address | The address receiving the tokens.  |
| amount | uint256 | The amount of tokens to be minted. |

### \_afterTokenTransfer

```solidity
function _afterTokenTransfer(address from, address to, uint256 amount) internal
```

\_Move voting power when tokens are transferred.

Emits a {IVotes-DelegateVotesChanged} event.\_
