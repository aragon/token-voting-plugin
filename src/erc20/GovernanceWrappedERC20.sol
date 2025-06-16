// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

/* solhint-disable max-line-length */
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20WrapperUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20WrapperUpgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20PermitUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20PermitUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {ERC20VotesUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {IGovernanceWrappedERC20} from "./IGovernanceWrappedERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/* solhint-enable max-line-length */

/// @title GovernanceWrappedERC20
/// @author Aragon X
/// @notice Wraps an existing [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token by
/// inheriting from `ERC20WrapperUpgradeable` and allows using it for voting by inheriting from `ERC20VotesUpgradeable`.
/// The latter is compatible with
/// [OpenZeppelin's `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes) interface.
/// The contract supports meta transactions. To use an `amount` of underlying tokens for voting, the token owner must:
/// 1. call `approve` for the tokens to be used by this contract
/// 2. call `depositFor` to wrap them, which safely transfers the underlying
/// [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens to the contract and mints wrapped
/// [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens.
/// To get the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens back, the owner of the wrapped tokens can call
/// `withdrawFor`, which  burns the wrapped [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens and
/// safely transfers the underlying tokens back to the owner.
/// @dev This contract intentionally has no public mint functionality because this is the
///      responsibility of the underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token contract.
/// @custom:security-contact sirt@aragon.org
contract GovernanceWrappedERC20 is
    IGovernanceWrappedERC20,
    Initializable,
    ERC165Upgradeable,
    ERC20VotesUpgradeable,
    ERC20WrapperUpgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice The list of addresses excluded from voting
    EnumerableSet.AddressSet internal excludedAccounts;

    /// @notice Thrown when an excluded account attempts to engage in voting activity.
    error AccountIsExcluded();

    /// @notice Calls the initialize function.
    /// @param _token The underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token.
    /// @param _name The name of the wrapped token.
    /// @param _symbol The symbol of the wrapped token.
    /// @param _excludedAccounts The list of accounts to exclude from voting
    constructor(
        IERC20Upgradeable _token,
        string memory _name,
        string memory _symbol,
        address[] memory _excludedAccounts
    ) {
        initialize(_token, _name, _symbol, _excludedAccounts);
    }

    /// @notice Initializes the contract.
    /// @param _token The underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token.
    /// @param _name The name of the wrapped token.
    /// @param _symbol The symbol of the wrapped token.
    /// @param _excludedAccounts The list of accounts to exclude from voting
    function initialize(
        IERC20Upgradeable _token,
        string memory _name,
        string memory _symbol,
        address[] memory _excludedAccounts
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __ERC20Wrapper_init(_token);

        for (uint256 i; i < _excludedAccounts.length;) {
            excludedAccounts.add(_excludedAccounts[i]);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return _interfaceId == type(IGovernanceWrappedERC20).interfaceId
            || _interfaceId == type(IERC20Upgradeable).interfaceId
            || _interfaceId == type(IERC20PermitUpgradeable).interfaceId
            || _interfaceId == type(IERC20MetadataUpgradeable).interfaceId
            || _interfaceId == type(IVotesUpgradeable).interfaceId || super.supportsInterface(_interfaceId);
    }

    /// @inheritdoc ERC20WrapperUpgradeable
    /// @dev Uses the `decimals` of the underlying [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token.
    function decimals() public view override(ERC20Upgradeable, ERC20WrapperUpgradeable) returns (uint8) {
        return ERC20WrapperUpgradeable.decimals();
    }

    function delegate(address _account) public override {
        if (excludedAccounts.contains(_account)) {
            revert AccountIsExcluded();
        }
        super.delegate(_account);
    }

    /// @inheritdoc ERC20VotesUpgradeable
    /// @dev This override extends the original implementation, ensuring that excluded addresses cannot use their voting power.
    function getVotes(address _account) public view override returns (uint256) {
        if (excludedAccounts.contains(_account)) {
            return 0;
        }
        return super.getVotes(_account);
    }

    /// @inheritdoc ERC20VotesUpgradeable
    /// @dev This override extends the original implementation, ensuring that excluded addresses cannot use their voting power.
    function getPastVotes(address _account, uint256 _timepoint) public view override returns (uint256) {
        if (excludedAccounts.contains(_account)) {
            return 0;
        }
        return super.getPastVotes(_account, _timepoint);
    }

    /// @inheritdoc IERC20Upgradeable
    /// @dev This override extends the original implementation, ensuring that excluded addresses cannot use their voting power.
    function totalSupply() public view override returns (uint256) {
        uint256 _excludedSupply = super.getVotes(address(0));
        for (uint256 i; i < excludedAccounts.length();) {
            /// @dev Using getVotes() even though these addresses cannot self delegate.
            /// @dev Another account could transfer a delegated balance to them.
            _excludedSupply += super.getVotes(excludedAccounts.at(i));

            unchecked {
                ++i;
            }
        }
        return super.totalSupply() - _excludedSupply;
    }

    /// @inheritdoc ERC20VotesUpgradeable
    /// @dev This override extends the original implementation, ensuring that excluded addresses cannot use their voting power.
    function getPastTotalSupply(uint256 _timepoint) public view override returns (uint256) {
        uint256 _excludedSupply = super.getPastVotes(address(0), _timepoint);
        for (uint256 i; i < excludedAccounts.length();) {
            /// @dev Using getPastVotes() even though these addresses cannot self delegate.
            /// @dev Another account could transfer a delegated balance to them.
            _excludedSupply += super.getPastVotes(excludedAccounts.at(i), _timepoint);

            unchecked {
                ++i;
            }
        }
        return super.getPastTotalSupply(_timepoint) - _excludedSupply;
    }

    /// @inheritdoc IGovernanceWrappedERC20
    function depositFor(address account, uint256 amount)
        public
        override(IGovernanceWrappedERC20, ERC20WrapperUpgradeable)
        returns (bool)
    {
        return ERC20WrapperUpgradeable.depositFor(account, amount);
    }

    /// @inheritdoc IGovernanceWrappedERC20
    function withdrawTo(address account, uint256 amount)
        public
        override(IGovernanceWrappedERC20, ERC20WrapperUpgradeable)
        returns (bool)
    {
        return ERC20WrapperUpgradeable.withdrawTo(account, amount);
    }

    // https://forum.openzeppelin.com/t/self-delegation-in-erc20votes/17501/12?u=novaknole
    /// @inheritdoc ERC20VotesUpgradeable
    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20VotesUpgradeable, ERC20Upgradeable)
    {
        super._afterTokenTransfer(from, to, amount);

        // Automatically turn on delegation on mint/transfer but only for the first time.
        if (to != address(0) && numCheckpoints(to) == 0 && delegates(to) == address(0)) {
            _delegate(to, to);
        }
    }

    /// @inheritdoc ERC20VotesUpgradeable
    function _mint(address to, uint256 amount) internal override(ERC20VotesUpgradeable, ERC20Upgradeable) {
        super._mint(to, amount);
    }

    /// @inheritdoc ERC20VotesUpgradeable
    function _burn(address account, uint256 amount) internal override(ERC20VotesUpgradeable, ERC20Upgradeable) {
        super._burn(account, amount);
    }
}
