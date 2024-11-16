# Solidity API

## IGovernanceWrappedERC20

An interface for the token wrapping contract wrapping existing
[ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens.

### depositFor

```solidity
function depositFor(address account, uint256 amount) external returns (bool)
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
function withdrawTo(address account, uint256 amount) external returns (bool)
```

Withdraws an amount of underlying tokens to a receiving address
and burns the corresponding number of wrapped tokens.

#### Parameters

| Name    | Type    | Description                                             |
| ------- | ------- | ------------------------------------------------------- |
| account | address | The address receiving the withdrawn, underlying tokens. |
| amount  | uint256 | The amount of underlying tokens to withdraw.            |
