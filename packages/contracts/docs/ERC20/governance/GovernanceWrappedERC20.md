# Solidity API

## GovernanceWrappedERC20

Wraps an existing [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token by
inheriting from `ERC20WrapperUpgradeable` and allows using it for voting by inheriting from `ERC20VotesUpgradeable`.
The latter is compatible with
[OpenZeppelin's `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes) interface.
The contract supports meta transactions. To use an `amount` of underlying tokens for voting, the token owner must:

1. call `approve` for the tokens to be used by this contract
2. call `depositFor` to wrap them, which safely transfers the underlying
   [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens to the contract and mints wrapped
   [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens.
   To get the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens back, the owner of the wrapped tokens can call
   `withdrawFor`, which burns the wrapped [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens and
   safely transfers the underlying tokens back to the owner.

_This contract intentionally has no public mint functionality because this is the
responsibility of the underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token contract._

### constructor

```solidity
constructor(contract IERC20Upgradeable _token, string _name, string _symbol) public
```

Calls the initialize function.

#### Parameters

| Name     | Type                       | Description                                                           |
| -------- | -------------------------- | --------------------------------------------------------------------- |
| \_token  | contract IERC20Upgradeable | The underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token. |
| \_name   | string                     | The name of the wrapped token.                                        |
| \_symbol | string                     | The symbol of the wrapped token.                                      |

### initialize

```solidity
function initialize(contract IERC20Upgradeable _token, string _name, string _symbol) public
```

Initializes the contract.

#### Parameters

| Name     | Type                       | Description                                                           |
| -------- | -------------------------- | --------------------------------------------------------------------- |
| \_token  | contract IERC20Upgradeable | The underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token. |
| \_name   | string                     | The name of the wrapped token.                                        |
| \_symbol | string                     | The symbol of the wrapped token.                                      |

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

### decimals

```solidity
function decimals() public view returns (uint8)
```

_Uses the `decimals` of the underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token._

### depositFor

```solidity
function depositFor(address account, uint256 amount) public returns (bool)
```

Deposits an amount of underlying token
and mints the corresponding number of wrapped tokens for a receiving address.

#### Parameters

| Name    | Type    | Description                                       |
| ------- | ------- | ------------------------------------------------- |
| account | address | The address receiving the minted, wrapped tokens. |
| amount  | uint256 | The amount of tokens to deposit.                  |

### withdrawTo

```solidity
function withdrawTo(address account, uint256 amount) public returns (bool)
```

Withdraws an amount of underlying tokens to a receiving address
and burns the corresponding number of wrapped tokens.

#### Parameters

| Name    | Type    | Description                                             |
| ------- | ------- | ------------------------------------------------------- |
| account | address | The address receiving the withdrawn, underlying tokens. |
| amount  | uint256 | The amount of underlying tokens to withdraw.            |

### \_afterTokenTransfer

```solidity
function _afterTokenTransfer(address from, address to, uint256 amount) internal
```

\_Move voting power when tokens are transferred.

Emits a {IVotes-DelegateVotesChanged} event.\_

### \_mint

```solidity
function _mint(address to, uint256 amount) internal
```

_Snapshots the totalSupply after it has been increased._

### \_burn

```solidity
function _burn(address account, uint256 amount) internal
```

_Snapshots the totalSupply after it has been decreased._
