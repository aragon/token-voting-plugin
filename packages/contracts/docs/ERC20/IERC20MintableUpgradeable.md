# Solidity API

## IERC20MintableUpgradeable

Interface to allow minting of [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens.

### mint

```solidity
function mint(address _to, uint256 _amount) external
```

Mints [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens for a receiving address.

#### Parameters

| Name     | Type    | Description            |
| -------- | ------- | ---------------------- |
| \_to     | address | The receiving address. |
| \_amount | uint256 | The amount of tokens.  |
