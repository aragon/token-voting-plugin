// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

/* solhint-disable max-line-length */
import {IERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20PermitUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {ERC20VotesUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";

import {DaoAuthorizableUpgradeable} from "@aragon/osx-commons-contracts/src/permission/auth/DaoAuthorizableUpgradeable.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IERC20MintableUpgradeable} from "../IERC20MintableUpgradeable.sol";

/* solhint-enable max-line-length */

/// @title GovernanceERC20
/// @author Aragon X
/// @notice An [OpenZeppelin `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes)
/// compatible [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token, used for voting and managed by a DAO.
/// @custom:security-contact sirt@aragon.org
contract GovernanceERC20 is
    IERC20MintableUpgradeable,
    Initializable,
    ERC165Upgradeable,
    ERC20VotesUpgradeable,
    DaoAuthorizableUpgradeable
{
    /// @notice The permission identifier to mint new tokens
    bytes32 public constant MINT_PERMISSION_ID = keccak256("MINT_PERMISSION");

    /// @notice The list of addresses excluded from voting
    address[] public excludedAccounts;

    /// @notice The settings for the initial mint of the token.
    /// @param receivers The receivers of the tokens.
    /// @param amounts The amounts of tokens to be minted for each receiver.
    /// @param amounts Wether each receiver should be excluded from voting purposes.
    /// @dev The lengths of `receivers` and `amounts` must match.
    /// @dev `excluded` can be empty. Otherwise it must match the length of `receivers`.
    struct MintSettings {
        address[] receivers;
        uint256[] amounts;
        bool[] excluded;
    }

    /// @notice Thrown if the number of receivers and amounts specified in the mint settings do not match.
    /// @param receiversArrayLength The length of the `receivers` array.
    /// @param amountsArrayLength The length of the `amounts` array.
    /// @param excludedArrayLength The length of the `excluded` array.
    error MintSettingsArrayLengthMismatch(
        uint256 receiversArrayLength,
        uint256 amountsArrayLength,
        uint256 excludedArrayLength
    );

    /// @notice Thrown when an excluded account attempts to engage in voting activity.
    error ExcludedAccount();

    /// @notice Calls the initialize function.
    /// @param _dao The managing DAO.
    /// @param _name The name of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _symbol The symbol of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _mintSettings The token mint settings struct containing the `receivers` and `amounts`.
    constructor(
        IDAO _dao,
        string memory _name,
        string memory _symbol,
        MintSettings memory _mintSettings
    ) {
        initialize(_dao, _name, _symbol, _mintSettings);
    }

    /// @notice Initializes the contract and mints tokens to a list of receivers.
    /// @param _dao The managing DAO.
    /// @param _name The name of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _symbol The symbol of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _mintSettings The token mint settings struct containing the `receivers` and `amounts`.
    function initialize(
        IDAO _dao,
        string memory _name,
        string memory _symbol,
        MintSettings memory _mintSettings
    ) public initializer {
        // Check mint settings
        if (_mintSettings.receivers.length != _mintSettings.amounts.length) {
            revert MintSettingsArrayLengthMismatch({
                receiversArrayLength: _mintSettings.receivers.length,
                amountsArrayLength: _mintSettings.amounts.length,
                excludedArrayLength: _mintSettings.excluded.length
            });
        } else if (
            _mintSettings.excluded.length > 0 &&
            _mintSettings.receivers.length != _mintSettings.excluded.length
        ) {
            revert MintSettingsArrayLengthMismatch({
                receiversArrayLength: _mintSettings.receivers.length,
                amountsArrayLength: _mintSettings.amounts.length,
                excludedArrayLength: _mintSettings.excluded.length
            });
        }

        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __DaoAuthorizableUpgradeable_init(_dao);

        for (uint256 i; i < _mintSettings.receivers.length; ) {
            _mint(_mintSettings.receivers[i], _mintSettings.amounts[i]);

            unchecked {
                ++i;
            }
        }
        for (uint256 i; i < _mintSettings.excluded.length; ) {
            if (!_mintSettings.excluded[i]) continue;

            excludedAccounts.push(_mintSettings.receivers[i]);
        }
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return
            _interfaceId == type(IERC20Upgradeable).interfaceId ||
            _interfaceId == type(IERC20PermitUpgradeable).interfaceId ||
            _interfaceId == type(IERC20MetadataUpgradeable).interfaceId ||
            _interfaceId == type(IVotesUpgradeable).interfaceId ||
            _interfaceId == type(IERC20MintableUpgradeable).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    function delegate(address account) public override {
        for (uint256 i; i < excludedAccounts.length; i++) {
            if (msg.sender != excludedAccounts[i]) continue;

            revert ExcludedAccount();
        }
        super.delegate(account);
    }

    /// @inheritdoc ERC20VotesUpgradeable
    /// @dev This override extends the original implementation, ensuring that excluded addresses cannot use their voting power.
    function getPastVotes(
        address account,
        uint256 timepoint
    ) public view override returns (uint256) {
        for (uint256 i; i < excludedAccounts.length; ++i) {
            if (account == excludedAccounts[i]) {
                return 0;
            }
        }
        return super.getPastVotes(account, timepoint);
    }

    /// @inheritdoc ERC20VotesUpgradeable
    /// @dev This override extends the original implementation, ensuring that excluded addresses cannot use their voting power.
    function getPastTotalSupply(uint256 timepoint) public view override returns (uint256) {
        uint256 excludedSupply = super.getPastVotes(address(0), timepoint);
        for (uint256 i; i < excludedAccounts.length; ++i) {
            /// @dev Using getPastVotes() even though these addresses cannot self delegate.
            /// @dev Another account could transfer a delegated balance to them.
            excludedSupply += super.getPastVotes(excludedAccounts[i], timepoint);
        }
        return super.getPastTotalSupply(timepoint) - excludedSupply;
    }

    /// @notice Mints tokens to an address.
    /// @param to The address receiving the tokens.
    /// @param amount The amount of tokens to be minted.
    function mint(address to, uint256 amount) external override auth(MINT_PERMISSION_ID) {
        _mint(to, amount);
    }

    // https://forum.openzeppelin.com/t/self-delegation-in-erc20votes/17501/12?u=novaknole
    /// @inheritdoc ERC20VotesUpgradeable
    function _afterTokenTransfer(address from, address to, uint256 amount) internal override {
        super._afterTokenTransfer(from, to, amount);

        // Automatically turn on delegation on mint/transfer but only for the first time.
        if (to != address(0) && numCheckpoints(to) == 0 && delegates(to) == address(0)) {
            _delegate(to, to);
        }
    }
}
