// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.28;

// A DAO that holds `UPGRADE_PLUGIN_PERMISSION` itself (what the build 1 and 2 setups granted it) can
// upgrade its plugin from a proposal, without the PluginSetupProcessor. The guard on `initializeFrom`
// lets the DAO through, the version is used up in the same call, and an outsider is still refused.

import {Test} from "forge-std/Test.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {DaoUnauthorized} from "@aragon/osx-commons-contracts/src/permission/auth/auth.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

import {TokenVoting} from "../src/TokenVoting.sol";
import {TokenVoting as TokenVotingR1B3} from "plugin-version-1.3/TokenVoting.sol";
import {MajorityVotingBase as MajorityVotingBaseR1B3} from "plugin-version-1.3/MajorityVotingBase.sol";

import {SimpleBuilder} from "./builders/SimpleBuilder.sol";
import {ERC20ClockMock} from "./mocks/ERC20ClockMock.sol";

contract UpgradeFromAProposalTest is Test {
    bytes32 internal constant UPGRADE_PLUGIN_PERMISSION_ID = keccak256("UPGRADE_PLUGIN_PERMISSION");
    bytes32 internal constant EXECUTE_PERMISSION_ID = keccak256("EXECUTE_PERMISSION");
    address internal outsider = makeAddr("outsider");

    function test_daoUpgradesItsOwnPlugin_fromAProposal() public {
        (DAO dao,,,) = new SimpleBuilder().build();
        TokenVotingR1B3 plugin = _deployR1B3(dao);
        dao.grant(address(plugin), address(dao), UPGRADE_PLUGIN_PERMISSION_ID);
        dao.grant(address(dao), address(this), EXECUTE_PERMISSION_ID);

        address newImplementation = address(new TokenVoting());
        Action[] memory actions = new Action[](1);
        actions[0] = Action({
            to: address(plugin),
            value: 0,
            data: abi.encodeWithSignature(
                "upgradeToAndCall(address,bytes)", newImplementation, abi.encodeCall(TokenVoting.initializeFrom, (3, ""))
            )
        });
        dao.execute(bytes32(0), actions, 0);

        TokenVoting updated = TokenVoting(address(plugin));
        assertEq(updated.implementation(), newImplementation, "upgraded");
        assertTrue(updated.tokenIndexedByTimestamp(), "the 3 -> 4 migration ran");

        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(plugin), outsider, UPGRADE_PLUGIN_PERMISSION_ID
            )
        );
        updated.initializeFrom(1, "");

        // The DAO itself, still holding the permission, finds the version used up.
        actions[0].data = abi.encodeCall(TokenVoting.initializeFrom, (1, ""));
        vm.expectRevert();
        dao.execute(bytes32(uint256(1)), actions, 0);
        assertEq(updated.getTargetConfig().target, address(dao));
    }

    function _deployR1B3(DAO dao) internal returns (TokenVotingR1B3) {
        return TokenVotingR1B3(
            ProxyLib.deployUUPSProxy(
                address(new TokenVotingR1B3()),
                abi.encodeCall(
                    TokenVotingR1B3.initialize,
                    (
                        dao,
                        MajorityVotingBaseR1B3.VotingSettings({
                            votingMode: MajorityVotingBaseR1B3.VotingMode.Standard,
                            supportThreshold: 500_000,
                            minParticipation: 100_000,
                            minDuration: 1 hours,
                            minProposerVotingPower: 0
                        }),
                        IVotesUpgradeable(address(new ERC20ClockMock(true))),
                        IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call}),
                        0,
                        ""
                    )
                )
            )
        );
    }
}
