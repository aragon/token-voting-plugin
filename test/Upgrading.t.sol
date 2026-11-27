// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TokenVoting} from "../src/TokenVoting.sol";
import {MajorityVotingBase} from "../src/base/MajorityVotingBase.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {ERC20ClockMock, ERC20NoClockMock} from "./mocks/ERC20ClockMock.sol";

import {TokenVoting as TokenVotingR1B1} from "./old-versions/v1.1/TokenVoting.sol";
import {
    MajorityVotingBase as MajorityVotingBaseR1B1,
    IMajorityVoting as IMajorityVotingR1B1
} from "./old-versions/v1.1/MajorityVotingBase.sol";
import {IDAO as IDAOR1B1} from "./old-versions/v1.1/IDAO.sol";

import {TokenVoting as TokenVotingR1B2} from "./old-versions/v1.2/TokenVoting.sol";
import {
    MajorityVotingBase as MajorityVotingBaseR1B2,
    IMajorityVoting as IMajorityVotingR1B2
} from "./old-versions/v1.2/MajorityVotingBase.sol";
import {IDAO as IDAOR1B2} from "./old-versions/v1.2/IDAO.sol";

import {TokenVoting as TokenVotingR1B3} from "plugin-version-1.3/TokenVoting.sol";
import {MajorityVotingBase as MajorityVotingBaseR1B3} from "plugin-version-1.3/MajorityVotingBase.sol";

import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {IPluginSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/IPluginSetup.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {DaoUnauthorized} from "@aragon/osx-commons-contracts/src/permission/auth/auth.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {SimpleBuilder} from "./builders/SimpleBuilder.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../src/erc20/GovernanceWrappedERC20.sol";

contract UpgradingTest is Test {
    error AlreadyInitialized();

    bytes32 internal constant UPGRADE_PLUGIN_PERMISSION_ID = keccak256("UPGRADE_PLUGIN_PERMISSION");

    function test_WhenUpgradingToANewImplementation() external {
        // It upgrades to a new implementation
        (DAO dao, TokenVoting plugin,,) = new SimpleBuilder().build();

        dao.grant(address(plugin), address(this), keccak256("UPGRADE_PLUGIN_PERMISSION"));

        address originalImpl = address(plugin.implementation());
        address newImpl = address(new TokenVoting());
        plugin.upgradeTo(newImpl);
        address currentImpl = address(plugin.implementation());

        assertNotEq(originalImpl, currentImpl);
        assertEq(currentImpl, newImpl);
    }

    modifier givenTheContractIsAtR1B1() {
        _;
    }

    function test_WhenUpgradingWithInitializeFrom() external givenTheContractIsAtR1B1 {
        // It Upgrades from v1.1 with `initializeFrom`
        (DAO dao,,,) = new SimpleBuilder().build();
        ERC20ClockMock tok = new ERC20ClockMock(true);

        // Install as 1.1
        TokenVotingR1B1 plugin = TokenVotingR1B1(
            ProxyLib.deployUUPSProxy(
                address(new TokenVotingR1B1()),
                abi.encodeCall(
                    TokenVotingR1B1.initialize,
                    (
                        IDAOR1B1(address(dao)),
                        MajorityVotingBaseR1B1.VotingSettings({
                            votingMode: MajorityVotingBaseR1B1.VotingMode.EarlyExecution,
                            supportThreshold: 123_456,
                            minParticipation: 234_567,
                            minDuration: 60 * 60,
                            minProposerVotingPower: 12341234
                        }),
                        tok
                    )
                )
            )
        );

        // Create a proposal
        dao.grant(address(plugin), address(this), keccak256("CREATE_PROPOSAL_PERMISSION"));
        uint256 proposalId = plugin.createProposal(
            "proposal-meta", new IDAOR1B1.Action[](0), 0, 0, 0, IMajorityVotingR1B1.VoteOption.None, false
        );

        // Upgrade
        dao.grant(address(plugin), address(this), keccak256("UPGRADE_PLUGIN_PERMISSION"));

        address originalImpl = address(plugin.implementation());

        // It The old `initialize` function fails during the upgrade
        vm.expectRevert("Initializable: contract is already initialized");
        plugin.upgradeToAndCall(
            originalImpl,
            abi.encodeCall(
                TokenVotingR1B1.initialize,
                (
                    IDAOR1B1(address(dao)),
                    MajorityVotingBaseR1B1.VotingSettings({
                        votingMode: MajorityVotingBaseR1B1.VotingMode.EarlyExecution,
                        supportThreshold: 123_456,
                        minParticipation: 234_567,
                        minDuration: 60 * 60,
                        minProposerVotingPower: 12341234
                    }),
                    tok
                )
            )
        );

        address newImpl = address(new TokenVoting());

        // It initializeFrom succeeds
        uint256 minApprovals = 1234;
        IPlugin.TargetConfig memory targetConfig =
            IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call});
        bytes memory pluginMetadata = "new-metadata";
        plugin.upgradeToAndCall(
            newImpl,
            abi.encodeCall(TokenVoting.initializeFrom, (1, abi.encode(minApprovals, targetConfig, pluginMetadata)))
        );

        address currentImpl = address(plugin.implementation());
        assertNotEq(originalImpl, currentImpl);
        assertEq(currentImpl, newImpl);

        // It protocol versions are updated correctly
        uint8[3] memory version = TokenVoting(address(plugin)).protocolVersion();
        assertEq(version[0], 1);
        assertEq(version[1], 4);
        assertEq(version[2], 0);

        // It new settings are applied
        assertEq(TokenVoting(address(plugin)).minApproval(), 1234);

        IPlugin.TargetConfig memory newTargetConfig = TokenVoting(address(plugin)).getTargetConfig();
        vm.assertEq(newTargetConfig.target, address(dao));
        vm.assertEq(uint8(newTargetConfig.operation), uint8(IPlugin.Operation.Call));
        vm.assertEq(TokenVoting(address(plugin)).getMetadata(), "new-metadata");

        // It the original `initialize` function is disabled post-upgrade
        vm.expectRevert();
        plugin.initialize(
            IDAOR1B1(address(dao)),
            MajorityVotingBaseR1B1.VotingSettings({
                votingMode: MajorityVotingBaseR1B1.VotingMode.EarlyExecution,
                supportThreshold: 123_456,
                minParticipation: 234_567,
                minDuration: 60 * 60,
                minProposerVotingPower: 12341234
            }),
            tok
        );

        (bool open, bool executed, MajorityVotingBase.ProposalParameters memory parameters,,,,) =
            TokenVoting(address(plugin)).getProposal(proposalId);

        // Existing proposals should remain available

        assertTrue(open);
        assertFalse(executed);
        assertEq(parameters.startDate, block.timestamp);
        assertEq(parameters.endDate, block.timestamp + 60 * 60);

        // Should detect the token clock (timestamp)
        proposalId = TokenVoting(address(plugin)).createProposal("proposal-meta-2", new Action[](0), 0, 0, "");
        (open, executed, parameters,,,,) = TokenVoting(address(plugin)).getProposal(proposalId);
        assertEq(parameters.snapshotTimepoint, block.timestamp - 1);
    }

    modifier givenTheContractIsAtR1B2() {
        _;
    }

    function test_WhenUpgradingWithInitializeFrom2() external givenTheContractIsAtR1B2 {
        // It Upgrades from v1.2 with `initializeFrom`
        (DAO dao,,,) = new SimpleBuilder().build();
        ERC20ClockMock tok = new ERC20ClockMock(true);

        // Install as 1.2
        TokenVotingR1B2 plugin = TokenVotingR1B2(
            ProxyLib.deployUUPSProxy(
                address(new TokenVotingR1B2()),
                abi.encodeCall(
                    TokenVotingR1B2.initialize,
                    (
                        IDAOR1B2(address(dao)),
                        MajorityVotingBaseR1B2.VotingSettings({
                            votingMode: MajorityVotingBaseR1B2.VotingMode.EarlyExecution,
                            supportThreshold: 123_456,
                            minParticipation: 234_567,
                            minDuration: 60 * 60,
                            minProposerVotingPower: 12341234
                        }),
                        tok
                    )
                )
            )
        );

        // Create a proposal
        dao.grant(address(plugin), address(this), keccak256("CREATE_PROPOSAL_PERMISSION"));
        uint256 proposalId = plugin.createProposal(
            "proposal-meta", new IDAOR1B2.Action[](0), 0, 0, 0, IMajorityVotingR1B2.VoteOption.None, false
        );

        // Upgrade
        dao.grant(address(plugin), address(this), keccak256("UPGRADE_PLUGIN_PERMISSION"));

        address originalImpl = address(plugin.implementation());

        // It The old `initialize` function fails during the upgrade
        vm.expectRevert("Initializable: contract is already initialized");
        plugin.upgradeToAndCall(
            originalImpl,
            abi.encodeCall(
                TokenVotingR1B2.initialize,
                (
                    IDAOR1B2(address(dao)),
                    MajorityVotingBaseR1B2.VotingSettings({
                        votingMode: MajorityVotingBaseR1B2.VotingMode.EarlyExecution,
                        supportThreshold: 123_456,
                        minParticipation: 234_567,
                        minDuration: 60 * 60,
                        minProposerVotingPower: 12341234
                    }),
                    tok
                )
            )
        );

        address newImpl = address(new TokenVoting());

        // It initializeFrom succeeds
        uint256 minApprovals = 1234;
        IPlugin.TargetConfig memory targetConfig =
            IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call});
        bytes memory pluginMetadata = "new-metadata";
        plugin.upgradeToAndCall(
            newImpl,
            abi.encodeCall(TokenVoting.initializeFrom, (1, abi.encode(minApprovals, targetConfig, pluginMetadata)))
        );

        address currentImpl = address(plugin.implementation());
        assertNotEq(originalImpl, currentImpl);
        assertEq(currentImpl, newImpl);

        // It protocol versions are updated correctly
        uint8[3] memory version = TokenVoting(address(plugin)).protocolVersion();
        assertEq(version[0], 1);
        assertEq(version[1], 4);
        assertEq(version[2], 0);

        // It new settings are applied
        assertEq(TokenVoting(address(plugin)).minApproval(), 1234);

        IPlugin.TargetConfig memory newTargetConfig = TokenVoting(address(plugin)).getTargetConfig();
        vm.assertEq(newTargetConfig.target, address(dao));
        vm.assertEq(uint8(newTargetConfig.operation), uint8(IPlugin.Operation.Call));
        vm.assertEq(TokenVoting(address(plugin)).getMetadata(), "new-metadata");

        // It the original `initialize` function is disabled post-upgrade
        vm.expectRevert();
        plugin.initialize(
            IDAOR1B2(address(dao)),
            MajorityVotingBaseR1B2.VotingSettings({
                votingMode: MajorityVotingBaseR1B2.VotingMode.EarlyExecution,
                supportThreshold: 123_456,
                minParticipation: 234_567,
                minDuration: 60 * 60,
                minProposerVotingPower: 12341234
            }),
            tok
        );

        (bool open, bool executed, MajorityVotingBase.ProposalParameters memory parameters,,,,) =
            TokenVoting(address(plugin)).getProposal(proposalId);

        // Existing proposals should remain available

        assertTrue(open);
        assertFalse(executed);
        assertEq(parameters.startDate, block.timestamp);
        assertEq(parameters.endDate, block.timestamp + 60 * 60);

        // Should detect the token clock (timestamp)
        proposalId = TokenVoting(address(plugin)).createProposal("proposal-meta-2", new Action[](0), 0, 0, "");
        (open, executed, parameters,,,,) = TokenVoting(address(plugin)).getProposal(proposalId);
        assertEq(parameters.snapshotTimepoint, block.timestamp - 1);
    }

    modifier givenTheContractIsAtR1B3() {
        _;
    }

    function test_WhenUpgradingWithInitializeFrom3() external givenTheContractIsAtR1B3 {
        // It upgrades from R1 B3 with `initializeFrom`
        (DAO dao,,,) = new SimpleBuilder().build();
        ERC20ClockMock tok = new ERC20ClockMock(true);

        // Install as 1.3
        TokenVotingR1B3 plugin = _deployR1B3(dao, tok);

        // Create a proposal
        dao.grant(address(plugin), address(this), keccak256("CREATE_PROPOSAL_PERMISSION"));
        uint256 proposalId = plugin.createProposal("proposal-meta", new Action[](0), 0, 0, "");

        // Upgrade
        dao.grant(address(plugin), address(this), keccak256("UPGRADE_PLUGIN_PERMISSION"));

        address originalImpl = address(plugin.implementation());

        // It The old `initialize` function fails during the upgrade
        vm.expectRevert(AlreadyInitialized.selector);
        plugin.upgradeToAndCall(
            originalImpl,
            abi.encodeCall(
                TokenVotingR1B3.initialize,
                (
                    dao,
                    MajorityVotingBaseR1B3.VotingSettings({
                        votingMode: MajorityVotingBaseR1B3.VotingMode.EarlyExecution,
                        supportThreshold: 123_456,
                        minParticipation: 234_567,
                        minDuration: 60 * 60,
                        minProposerVotingPower: 12341234
                    }),
                    tok,
                    IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call}),
                    556677, // minApprovals
                    "some-more-meta"
                )
            )
        );

        // It initializeFrom succeeds, with the initData the build 4 setup prepares for a 3 -> 4 update
        address newImpl = _upgradeWithSetupInitData(dao, plugin, 3);

        address currentImpl = address(plugin.implementation());
        assertNotEq(originalImpl, currentImpl);
        assertEq(currentImpl, newImpl);

        // It protocol versions are updated correctly
        uint8[3] memory version = TokenVoting(address(plugin)).protocolVersion();
        assertEq(version[0], 1);
        assertEq(version[1], 4);
        assertEq(version[2], 0);

        // It settings remain
        assertEq(TokenVoting(address(plugin)).minApproval(), 556677);

        IPlugin.TargetConfig memory newTargetConfig = TokenVoting(address(plugin)).getTargetConfig();
        vm.assertEq(newTargetConfig.target, address(dao));
        vm.assertEq(uint8(newTargetConfig.operation), uint8(IPlugin.Operation.Call));
        vm.assertEq(TokenVoting(address(plugin)).getMetadata(), "more-meta");

        // It the original `initialize` function is disabled post-upgrade
        vm.expectRevert();
        plugin.initialize(
            dao,
            MajorityVotingBaseR1B3.VotingSettings({
                votingMode: MajorityVotingBaseR1B3.VotingMode.EarlyExecution,
                supportThreshold: 123_456,
                minParticipation: 234_567,
                minDuration: 60 * 60,
                minProposerVotingPower: 12341234
            }),
            tok,
            IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call}),
            556677, // minApprovals
            "some-meta"
        );

        (bool open, bool executed, MajorityVotingBase.ProposalParameters memory parameters,,,,) =
            TokenVoting(address(plugin)).getProposal(proposalId);

        // Existing proposals should remain available

        assertTrue(open);
        assertFalse(executed);
        assertEq(parameters.startDate, block.timestamp);
        assertEq(parameters.endDate, block.timestamp + 60 * 60);

        // Should detect the token clock (timestamp)
        proposalId = plugin.createProposal("proposal-meta-2", new Action[](0), 0, 0, "");
        (open, executed, parameters,,,,) = TokenVoting(address(plugin)).getProposal(proposalId);
        assertEq(parameters.snapshotTimepoint, block.timestamp - 1);
    }

    function test_WhenAnOutsiderCallsInitializeFromAfterABareUpgrade() external givenTheContractIsAtR1B3 {
        // It reverts: `initializeFrom` needs the UPGRADE_PLUGIN_PERMISSION, which only the upgrade path holds
        (DAO dao,,,) = new SimpleBuilder().build();
        TokenVotingR1B3 plugin = _deployR1B3(dao, new ERC20ClockMock(true));
        dao.grant(address(plugin), address(this), UPGRADE_PLUGIN_PERMISSION_ID);
        plugin.upgradeTo(address(new TokenVoting())); // a bare upgrade leaves version 3 unconsumed

        address outsider = makeAddr("outsider");
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(plugin), outsider, UPGRADE_PLUGIN_PERMISSION_ID
            )
        );
        TokenVoting(address(plugin)).initializeFrom(1, _takeoverInitData(outsider));

        // It leaves the plugin as it was
        assertEq(TokenVoting(address(plugin)).getTargetConfig().target, address(dao));
        assertEq(TokenVoting(address(plugin)).minApproval(), 556677);
    }

    function testFuzz_WhenAnyCallerWithoutTheUpgradePermissionCallsInitializeFrom(address caller, uint16 fromBuild)
        external
        givenTheContractIsAtR1B3
    {
        // It reverts for every caller but the one holding the UPGRADE_PLUGIN_PERMISSION, whatever build it claims
        (DAO dao,,,) = new SimpleBuilder().build();
        TokenVotingR1B3 plugin = _deployR1B3(dao, new ERC20ClockMock(true));
        dao.grant(address(plugin), address(this), UPGRADE_PLUGIN_PERMISSION_ID);
        plugin.upgradeTo(address(new TokenVoting()));
        vm.assume(caller != address(this));

        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(plugin), caller, UPGRADE_PLUGIN_PERMISSION_ID
            )
        );
        TokenVoting(address(plugin)).initializeFrom(fromBuild, _takeoverInitData(caller));
    }

    function test_WhenTheUpgradePermissionHolderCallsInitializeFromAfterABareUpgrade()
        external
        givenTheContractIsAtR1B3
    {
        // It runs the migration to build 4 once, and a second call finds the version consumed
        (DAO dao,,,) = new SimpleBuilder().build();
        TokenVotingR1B3 plugin = _deployR1B3(dao, new ERC20ClockMock(true));
        dao.grant(address(plugin), address(this), UPGRADE_PLUGIN_PERMISSION_ID);
        plugin.upgradeTo(address(new TokenVoting()));

        TokenVoting(address(plugin)).initializeFrom(3, "");
        assertTrue(TokenVoting(address(plugin)).tokenIndexedByTimestamp());

        vm.expectRevert("Initializable: contract is already initialized");
        TokenVoting(address(plugin)).initializeFrom(3, "");
    }

    /// Deploys a plugin proxy at R1 B3 with the settings the R1 B3 upgrade tests assert on.
    function _deployR1B3(DAO dao, ERC20ClockMock tok) internal returns (TokenVotingR1B3) {
        return TokenVotingR1B3(
            ProxyLib.deployUUPSProxy(
                address(new TokenVotingR1B3()),
                abi.encodeCall(
                    TokenVotingR1B3.initialize,
                    (
                        dao,
                        MajorityVotingBaseR1B3.VotingSettings({
                            votingMode: MajorityVotingBaseR1B3.VotingMode.EarlyExecution,
                            supportThreshold: 123_456,
                            minParticipation: 234_567,
                            minDuration: 60 * 60,
                            minProposerVotingPower: 12341234
                        }),
                        tok,
                        IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call}),
                        556677, // minApprovals
                        "more-meta"
                    )
                )
            )
        );
    }

    /// Upgrades `plugin` to build 4 with the initData the build 4 setup prepares for an update from
    /// `fromBuild`, as the PluginSetupProcessor would. The caller must hold the upgrade permission.
    /// The setup gets throwaway token bases: only its `prepareUpdate` output is used here.
    function _upgradeWithSetupInitData(DAO dao, TokenVotingR1B3 plugin, uint16 fromBuild)
        internal
        returns (address newImpl)
    {
        GovernanceERC20 govBase = new GovernanceERC20(
            IDAO(address(0)), "G", "G", GovernanceERC20.MintSettings(new address[](0), new uint256[](0), false)
        );
        GovernanceWrappedERC20 wrappedBase = new GovernanceWrappedERC20(IERC20Upgradeable(address(0x1)), "WG", "WG");
        TokenVotingSetup setup = new TokenVotingSetup(new TokenVoting(), govBase, wrappedBase);

        (bytes memory initData,) = setup.prepareUpdate(
            address(dao),
            fromBuild,
            IPluginSetup.SetupPayload({plugin: address(plugin), currentHelpers: new address[](0), data: ""})
        );
        newImpl = setup.implementation();
        plugin.upgradeToAndCall(newImpl, initData);
    }

    /// What an attacker would pass to `initializeFrom` to run its own code with the plugin's permissions.
    function _takeoverInitData(address attacker) internal pure returns (bytes memory) {
        return abi.encode(
            uint256(0), IPlugin.TargetConfig({target: attacker, operation: IPlugin.Operation.DelegateCall}), bytes("")
        );
    }
}
