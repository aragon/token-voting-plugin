// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {TokenVoting} from "./TokenVoting.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";

import {PermissionCondition} from "@aragon/osx-commons-contracts/src/permission/condition/PermissionCondition.sol";

contract VotingPowerCondition is PermissionCondition {
    TokenVoting private immutable TOKEN_VOTING;
    IVotesUpgradeable private immutable VOTING_TOKEN;

    constructor(address _tokenVoting) {
        TOKEN_VOTING = TokenVoting(_tokenVoting);
        VOTING_TOKEN = TOKEN_VOTING.getVotingToken();
    }

    function isGranted(
        address _where,
        address _who,
        bytes32 _permissionId,
        bytes calldata _data
    ) public view override returns (bool) {
        (_where, _data, _permissionId);

        uint256 minProposerVotingPower_ = TOKEN_VOTING.minProposerVotingPower();
    
        if (minProposerVotingPower_ != 0) {
            if (
                VOTING_TOKEN.getVotes(_who) < minProposerVotingPower_ &&
                IERC20Upgradeable(address(VOTING_TOKEN)).balanceOf(_who) < minProposerVotingPower_
            ) {
                return false;
            }
        }

        return true;
    }
}
