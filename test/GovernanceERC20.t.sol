// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.28;

import {TestBase} from "./lib/TestBase.sol";
import {DAO, IDAO} from "@aragon/osx/core/dao/DAO.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {DaoUnauthorized} from "@aragon/osx-commons-contracts/src/permission/auth/auth.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";
import {IERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20PermitUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20PermitUpgradeable.sol";
import {IERC20MetadataUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20MintableUpgradeable} from "../src/erc20/IERC20MintableUpgradeable.sol";

contract GovernanceERC20Test is TestBase {
    address internal DAO_BASE = address(new DAO());

    DAO internal dao;
    GovernanceERC20 internal token;

    string constant TOKEN_NAME = "Governance Token";
    string constant TOKEN_SYMBOL = "GOV";

    address internal from;
    address internal to;
    address internal other;
    address internal toDelegate;
    address internal fromDelegate;

    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    event MintingFrozen();

    error MintingIsFrozen();

    function setUp() public {
        dao = DAO(
            payable(
                ProxyLib.deployUUPSProxy(
                    DAO_BASE,
                    // The test contract is the owner of the DAO
                    abi.encodeWithSelector(DAO.initialize.selector, "Test DAO", address(this), address(0), "")
                )
            )
        );

        address[] memory receivers = new address[](3);
        receivers[0] = alice;
        receivers[1] = bob;
        receivers[2] = carol;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;
        amounts[2] = 300 ether;

        GovernanceERC20.MintSettings memory mintSettings = GovernanceERC20.MintSettings(receivers, amounts);
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, mintSettings);
    }

    modifier givenTheContractIsBeingDeployedWithDefaultMintSettings() {
        _;
    }

    function test_WhenCallingInitializeAgain() external givenTheContractIsBeingDeployedWithDefaultMintSettings {
        // It reverts if trying to re-initialize
        GovernanceERC20.MintSettings memory emptyMintSettings;
        vm.expectRevert("Initializable: contract is already initialized");
        token.initialize(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
    }

    function test_WhenCheckingTheTokenNameAndSymbol()
        external
        view
        givenTheContractIsBeingDeployedWithDefaultMintSettings
    {
        // It sets the token name and symbol
        assertEq(token.name(), TOKEN_NAME);
        assertEq(token.symbol(), TOKEN_SYMBOL);
    }

    function test_WhenCheckingTheManagingDAO() external view givenTheContractIsBeingDeployedWithDefaultMintSettings {
        // It sets the managing DAO
        assertEq(address(token.dao()), address(dao));
    }

    function test_WhenDeployingWithMismatchedReceiversAndAmountsArrays() external {
        // It reverts if the `receivers` and `amounts` array lengths in the mint settings mismatch

        address[] memory receivers = new address[](1);
        receivers[0] = alice;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;

        GovernanceERC20.MintSettings memory mintSettings = GovernanceERC20.MintSettings(receivers, amounts);

        vm.expectRevert(
            abi.encodeWithSelector(
                GovernanceERC20.MintSettingsArrayLengthMismatch.selector, receivers.length, amounts.length
            )
        );
        new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, mintSettings);
    }

    modifier givenTheContractIsDeployed() {
        GovernanceERC20.MintSettings memory emptyMintSettings;
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
        _;
    }

    function test_WhenCallingSupportsInterfaceWithTheEmptyInterface() external givenTheContractIsDeployed {
        // It does not support the empty interface
        assertFalse(token.supportsInterface(0xffffffff));
    }

    function test_WhenCallingSupportsInterfaceWithTheIERC165UpgradeableInterface()
        external
        givenTheContractIsDeployed
    {
        // It supports the `IERC165Upgradeable` interface
        assertTrue(token.supportsInterface(type(IERC165Upgradeable).interfaceId));
    }

    function test_WhenCallingSupportsInterfaceWithAllInheritedInterfaces() external givenTheContractIsDeployed {
        // It it supports all inherited interfaces
        assertTrue(token.supportsInterface(type(IERC20Upgradeable).interfaceId));
        assertTrue(token.supportsInterface(type(IERC20PermitUpgradeable).interfaceId));
        assertTrue(token.supportsInterface(type(IVotesUpgradeable).interfaceId));
        assertTrue(token.supportsInterface(type(IERC20MintableUpgradeable).interfaceId));
        assertTrue(token.supportsInterface(type(IERC20MetadataUpgradeable).interfaceId));
    }

    modifier givenTheContractIsDeployed2() {
        // Same as givenTheContractIsDeployed, used for logical separation

        GovernanceERC20.MintSettings memory emptyMintSettings;
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
        _;
    }

    modifier givenTheCallerIsMissingTheMINTPERMISSIONID() {
        // By default, Alice does not have the permission
        vm.prank(alice);
        _;
    }

    function test_WhenCallingMint() external givenTheContractIsDeployed2 givenTheCallerIsMissingTheMINTPERMISSIONID {
        // It reverts if the `MINT_PERMISSION_ID` permission is missing
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(token), address(this), token.MINT_PERMISSION_ID()
            )
        );
        token.mint(alice, 100 ether);
    }

    modifier givenTheCallerHasTheMINTPERMISSIONID() {
        dao.grant(address(token), address(this), token.MINT_PERMISSION_ID());
        _;
    }

    function test_WhenCallingMint2() external givenTheContractIsDeployed2 givenTheCallerHasTheMINTPERMISSIONID {
        // It mints tokens if the caller has the `mintPermission`
        uint256 amount = 100 ether;
        uint256 initialBalance = token.balanceOf(bob);

        token.mint(bob, amount);

        assertEq(token.balanceOf(bob), initialBalance + amount);
    }

    modifier givenTheContractIsDeployedWithInitialBalances() {
        // Same as givenTheContractIsBeingDeployedWithDefaultMintSettings, used for logical separation
        address[] memory receivers = new address[](3);
        receivers[0] = alice;
        receivers[1] = bob;
        receivers[2] = carol;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;
        amounts[2] = 300 ether;

        GovernanceERC20.MintSettings memory mintSettings = GovernanceERC20.MintSettings(receivers, amounts);
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, mintSettings);
        _;
    }

    function test_WhenDeployingWithInitialBalances_InitialDelegationIsZero()
        external
        givenTheContractIsDeployedWithInitialBalances
    {
        // It confirms users with balances have no votes until they delegate
        assertEq(token.balanceOf(alice), 100 ether, "Alice should have a balance");
        assertEq(token.delegates(alice), address(0), "Alice should have no delegate");
        assertEq(token.getVotes(alice), 0, "Alice should have no votes");

        assertEq(token.balanceOf(bob), 200 ether, "Bob should have a balance");
        assertEq(token.delegates(bob), address(0), "Bob should have no delegate");
        assertEq(token.getVotes(bob), 0, "Bob should have no votes");
    }

    function test_WhenDelegatingVotingPowerToAnotherAccount() external givenTheContractIsDeployedWithInitialBalances {
        // It delegates voting power to another account
        uint256 aliceBalance = token.balanceOf(alice);
        uint256 bobBalance = token.balanceOf(bob);

        // Initially, users have no votes and are not delegated
        assertEq(token.delegates(alice), address(0));
        assertEq(token.delegates(bob), address(0));
        assertEq(token.getVotes(alice), 0);
        assertEq(token.getVotes(bob), 0);

        // Users must self-delegate to activate their voting power
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit DelegateChanged(alice, address(0), alice);
        token.delegate(alice);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit DelegateChanged(bob, address(0), bob);
        token.delegate(bob);

        // After self-delegation, they have voting power
        assertEq(token.getVotes(alice), aliceBalance);
        assertEq(token.getVotes(bob), bobBalance);

        // Alice delegates to Bob
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit DelegateChanged(alice, alice, bob);
        token.delegate(bob);

        assertEq(token.delegates(alice), bob);
        assertEq(token.getVotes(alice), 0);
        assertEq(token.getVotes(bob), aliceBalance + bobBalance);
    }

    function test_WhenDelegatingVotingPowerMultipleTimes() external givenTheContractIsDeployedWithInitialBalances {
        // It is checkpointed
        uint256 aliceBalance = token.balanceOf(alice);
        uint256 bobBalance = token.balanceOf(bob);
        uint256 carolBalance = token.balanceOf(carol);

        // Explicitly delegate to set up the initial state
        vm.prank(alice);
        token.delegate(bob); // Alice's votes go to Bob
        vm.prank(bob);
        token.delegate(bob); // Bob's votes go to Bob
        vm.prank(carol);
        token.delegate(carol); // Carol's votes go to Carol

        uint256 block1 = block.number;
        vm.roll(block.number + 1);

        // Check votes at block1
        assertEq(token.getPastVotes(alice, block1), 0);
        assertEq(token.getPastVotes(bob, block1), aliceBalance + bobBalance);
        assertEq(token.getPastVotes(carol, block1), carolBalance);

        // Alice changes her delegation from Bob to Carol
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit DelegateChanged(alice, bob, carol);
        token.delegate(carol);

        // Check current votes
        assertEq(token.getVotes(alice), 0);
        assertEq(token.getVotes(bob), bobBalance);
        assertEq(token.getVotes(carol), carolBalance + aliceBalance);

        // Check past votes remain correct
        assertEq(token.getPastVotes(alice, block1), 0);
        assertEq(token.getPastVotes(bob, block1), aliceBalance + bobBalance);
        assertEq(token.getPastVotes(carol, block1), carolBalance);
    }

    modifier givenATokenIsDeployedAndTheMainSignerCanMint() {
        GovernanceERC20.MintSettings memory emptyMintSettings;
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
        // Grant mint permission to the test contract
        dao.grant(address(token), address(this), token.MINT_PERMISSION_ID());
        _;
    }

    function test_WhenCheckingPastVotes_BeforeFirstDelegation() external givenATokenIsDeployedAndTheMainSignerCanMint {
        // It returns 0 for past votes if the user never delegated
        token.mint(alice, 100 ether);
        uint256 block1 = block.number;
        vm.roll(block.number + 5);
        uint256 block2 = block.number;

        assertEq(token.getPastVotes(alice, block1 - 1), 0, "Past votes at block1 should be 0");
        assertEq(token.getPastVotes(alice, block2 - 1), 0, "Past votes at block2 should be 0");
        assertEq(token.getVotes(alice), 0, "Current votes should be 0");
    }

    function test_WhenMintingTokensToAnAddressForTheFirstTime() external givenATokenIsDeployedAndTheMainSignerCanMint {
        // It has no delegation after mint
        assertEq(token.delegates(alice), address(0));
        token.mint(alice, 1 ether);

        // State remains unchanged: no auto-delegation
        assertEq(token.delegates(alice), address(0));
        assertEq(token.getVotes(alice), 0);

        // Alice must explicitly delegate to get voting power
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit DelegateChanged(alice, address(0), alice);
        token.delegate(alice);

        assertEq(token.delegates(alice), alice);
        assertEq(token.getVotes(alice), 1 ether);
    }

    function test_WhenTransferringTokensToAnAddressForTheFirstTime()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
    {
        // It has no delegation for the `to` address after transfer
        token.mint(alice, 100 ether);
        // Alice must delegate to have voting power
        vm.prank(alice);
        token.delegate(alice);

        assertEq(token.delegates(bob), address(0));

        vm.prank(alice);
        token.transfer(bob, 50 ether);

        // Bob receives tokens, but has no votes until he delegates
        assertEq(token.delegates(bob), address(0));
        assertEq(token.getVotes(bob), 0);

        // Bob explicitly delegates
        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit DelegateChanged(bob, address(0), bob);
        token.delegate(bob);

        assertEq(token.delegates(bob), bob);
        assertEq(token.getVotes(bob), 50 ether);
    }

    function test_WhenPerformingAChainOfTransfersABC() external givenATokenIsDeployedAndTheMainSignerCanMint {
        // It has no delegation for all users in the chain of transfer A => B => C
        token.mint(alice, 100 ether); // A

        vm.prank(alice);
        token.transfer(bob, 50 ether); // A -> B

        vm.prank(bob);
        token.transfer(carol, 25 ether); // B -> C

        // Without explicit delegation, no one has voting power
        assertEq(token.getVotes(alice), 0);
        assertEq(token.getVotes(bob), 0);
        assertEq(token.getVotes(carol), 0);

        // Each user must delegate to activate their votes
        vm.prank(alice);
        token.delegate(alice);
        vm.prank(bob);
        token.delegate(bob);
        vm.prank(carol);
        token.delegate(carol);

        assertEq(token.getVotes(alice), 50 ether);
        assertEq(token.getVotes(bob), 25 ether);
        assertEq(token.getVotes(carol), 25 ether);
    }

    modifier givenTheReceiverHasManuallyTurnedOffDelegation() {
        token.mint(alice, 100 ether);

        vm.prank(alice);
        token.transfer(bob, 50 ether);

        // Bob delegates and then immediately undelegates
        vm.prank(bob);
        token.delegate(bob);
        vm.prank(bob);
        token.delegate(address(0));
        _;
    }

    function test_WhenTransferringTokensToTheReceiver()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
        givenTheReceiverHasManuallyTurnedOffDelegation
    {
        // It should not change delegation on `transfer` if `to` manually turned it off
        vm.prank(alice);
        token.transfer(bob, 10 ether);
        assertEq(token.delegates(bob), address(0));
        assertEq(token.getVotes(bob), 0);
    }

    function test_WhenMintingTokensToTheReceiver()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
        givenTheReceiverHasManuallyTurnedOffDelegation
    {
        // It should not change delegation on `mint` if `to` manually turned it off
        token.mint(bob, 10 ether);
        assertEq(token.delegates(bob), address(0));
        assertEq(token.getVotes(bob), 0);
    }

    modifier givenAUserHasPredelegatedBeforeReceivingTokens() {
        // Bob (with 0 balance) pre-delegates to Carol
        assertEq(token.balanceOf(bob), 0, "Bob should have zero balance initially");
        assertEq(token.getVotes(carol), 0, "Carol should have zero votes initially");
        vm.prank(bob);
        token.delegate(carol);
        // Assert that pre-delegating with zero balance has no effect on votes
        assertEq(token.delegates(bob), carol, "Bob's delegate should be Carol");
        assertEq(token.getVotes(carol), 0, "Carol's votes should still be zero");
        _;
    }

    function test_WhenTransferringTokensToTheUser()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
        givenAUserHasPredelegatedBeforeReceivingTokens
    {
        // It should not rewrite delegation setting for `transfer` if user set it on before receiving tokens
        token.mint(alice, 100 ether);
        vm.prank(alice);
        token.transfer(bob, 50 ether);
        assertEq(token.delegates(bob), carol, "Bob's delegate should remain on Carol");
        assertEq(token.getVotes(bob), 0, "Bob should have no direct votes");
        assertEq(token.getVotes(carol), 50 ether, "Carol should receive the delegated votes");
    }

    function test_WhenMintingTokensToTheUser()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
        givenAUserHasPredelegatedBeforeReceivingTokens
    {
        // It should not rewrite delegation setting for `mint` if user set it on before receiving tokens
        token.mint(bob, 50 ether);
        assertEq(token.delegates(bob), carol, "Bob's delegate should remain on Carol");
        assertEq(token.getVotes(bob), 0, "Bob should have no direct votes");
        assertEq(token.getVotes(carol), 50 ether, "Carol should receive the delegated votes");
    }

    modifier givenDelegationWasTurnedOnInThePast() {
        token.mint(alice, 100 ether);
        vm.prank(alice);
        token.delegate(alice);

        _;
    }

    function test_WhenMintingMoreTokens()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
        givenDelegationWasTurnedOnInThePast
    {
        // It should update votes on `mint` if delegation was turned on
        token.mint(alice, 50 ether);
        assertEq(token.getVotes(alice), 150 ether);
    }

    function test_WhenTransferringMoreTokens()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
        givenDelegationWasTurnedOnInThePast
    {
        // It should update votes on `transfer` if delegation was turned on
        token.mint(bob, 100 ether);
        vm.prank(bob);
        token.delegate(bob); // Bob must delegate to have votes

        vm.prank(alice);
        token.transfer(bob, 50 ether);
        assertEq(token.getVotes(bob), 150 ether);
    }

    function test_WhenTransferringTokensFromAnAddressWithDelegationTurnedOn()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
    {
        // It updates voting power after transfer for `from` if delegation turned on
        token.mint(alice, 100 ether);
        vm.prank(alice);
        token.delegate(alice); // Alice must delegate to have votes
        assertEq(token.getVotes(alice), 100 ether);

        vm.prank(alice);
        token.transfer(bob, 30 ether);
        assertEq(token.getVotes(alice), 70 ether);
    }

    function test_WhenTransferringTokensToAnAddressWithDelegationTurnedOn()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint
    {
        // It updates voting power after transfer for `to` if delegation turned on
        token.mint(alice, 100 ether);
        vm.prank(alice);
        token.delegate(alice); // Alice delegates to have her votes moved correctly

        // Bob must pre-delegate to have his votes updated on receipt
        vm.prank(bob);
        token.delegate(bob);
        assertEq(token.getVotes(bob), 0);

        vm.prank(alice);
        token.transfer(bob, 30 ether);
        assertEq(token.getVotes(bob), 30 ether);
    }

    // Exhaustive tests setup
    modifier givenATokenIsDeployedAndTheMainSignerCanMint2() {
        from = alice;
        to = bob;
        other = carol;

        GovernanceERC20.MintSettings memory emptyMintSettings;
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
        dao.grant(address(token), address(this), token.MINT_PERMISSION_ID());
        _;
    }

    modifier givenTheToAddressHasAZeroBalance() {
        assertEq(token.balanceOf(to), 0);
        toDelegate = address(0);
        _;
    }

    modifier givenTheToAddressHasDelegatedToOther() {
        vm.prank(to);
        token.delegate(other);
        toDelegate = other;
        _;
    }

    function test_WhenTheToAddressReceivesTokensViaMint()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasAZeroBalance
        givenTheToAddressHasDelegatedToOther
    {
        token.mint(to, 100);

        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), toDelegate, "`to`s delegate has not changed");
        assertEq(token.getVotes(toDelegate), 100, "`to`s delegate has the correct voting power");
    }

    function test_WhenTheToAddressReceivesTokensViaTransferFromFrom()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasAZeroBalance
        givenTheToAddressHasDelegatedToOther
    {
        token.mint(from, 100);
        vm.prank(from);
        token.delegate(from); // `from` must delegate for its votes to be moved
        fromDelegate = from;

        vm.prank(from);
        token.transfer(to, 100);

        assertEq(token.getVotes(from), 0, "`from` has the correct voting power");
        assertEq(token.delegates(from), from, "`from`s delegate has not changed");
        assertEq(token.getVotes(fromDelegate), 0, "`from`s delegate has the correct voting power");
        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), toDelegate, "`to`s delegate has not changed");
        assertEq(token.getVotes(toDelegate), 100, "`to`s delegate has the correct voting power");
    }

    modifier givenTheToAddressHasNotDelegatedBefore() {
        toDelegate = address(0);
        _;
    }

    function test_WhenTheToAddressReceivesTokensViaMint2()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasAZeroBalance
        givenTheToAddressHasNotDelegatedBefore
    {
        token.mint(to, 100);
        // toDelegate is not set because `to` hasn't delegated. It remains address(0)

        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), address(0), "`to`s delegate has not changed");
        // Check votes of address(0) which is not meaningful, but checking `to`'s votes (who is not a delegate) is better
        assertEq(token.getVotes(to), 0, "`to`s delegate (none) has the correct voting power");
    }

    function test_WhenTheToAddressReceivesTokensViaTransferFromFrom2()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasAZeroBalance
        givenTheToAddressHasNotDelegatedBefore
    {
        token.mint(from, 100);
        // fromDelegate is not set because `from` hasn't delegated
        fromDelegate = address(0);

        vm.prank(from);
        token.transfer(to, 100);
        // toDelegate is not set because `to` hasn't delegated

        assertEq(token.getVotes(from), 0, "`from` has the correct voting power");
        assertEq(token.delegates(from), address(0), "`from`s delegate has not changed");
        assertEq(token.getVotes(fromDelegate), 0, "`from`s delegate has the correct voting power");
        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), address(0), "`to`s delegate has not changed");
        assertEq(token.getVotes(to), 0, "`to`s delegate has the correct voting power");
    }

    modifier givenTheToAddressHasANonzeroBalance() {
        token.mint(to, 100);
        vm.prank(to);
        token.delegate(to); // Explicitly self-delegate to have voting power
        toDelegate = to;
        _;
    }

    modifier givenTheToAddressHasDelegatedToOther2() {
        vm.prank(to);
        token.delegate(other);
        toDelegate = other;
        _;
    }

    modifier whenTheToAddressReceivesTokensViaMint3() {
        token.mint(to, 100);
        _;
    }

    function test_WhenTheToAddressThenTransfersToOther()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasDelegatedToOther2
        whenTheToAddressReceivesTokensViaMint3
    {
        // initial state: bal(to)=200, delegates(to)=other, getVotes(other)=200
        vm.prank(to);
        token.transfer(other, 100);
        // final state: bal(to)=100, bal(other)=100. votes are moved from `other` to `delegates(other)` (0x0).
        // getVotes(other) becomes 200 - 100 = 100.
        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), toDelegate, "`to`s delegate has not changed");
        assertEq(token.getVotes(toDelegate), 100, "`to`s delegate has the correct voting power");
    }

    function test_WhenTheToAddressThenDelegatesToOtherAgain()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasDelegatedToOther2
        whenTheToAddressReceivesTokensViaMint3
    {
        vm.prank(to);
        token.delegate(other);
        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), other, "`to`s delegate is correctly changed");
        assertEq(token.getVotes(other), 200, "`to`s delegate has the correct voting power");
    }

    modifier whenTheToAddressReceivesTokensViaTransferFromFrom3() {
        token.mint(from, 100);
        vm.prank(from);
        token.delegate(from);
        fromDelegate = from;
        vm.prank(from);
        token.transfer(to, 100);
        _;
    }

    function test_WhenTheToAddressThenTransfersToOther2()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasDelegatedToOther2
        whenTheToAddressReceivesTokensViaTransferFromFrom3
    {
        vm.prank(to);
        token.transfer(other, 100);

        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), toDelegate, "`to`s delegate has not changed");
        assertEq(token.getVotes(toDelegate), 100, "`to`s delegate has the correct voting power");
    }

    function test_WhenTheToAddressThenDelegatesToOtherAgain2()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasDelegatedToOther2
        whenTheToAddressReceivesTokensViaTransferFromFrom3
    {
        vm.prank(to);
        token.delegate(other);
        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), other, "`to`s delegate is correctly changed");
        assertEq(token.getVotes(other), 200, "`to`s delegate has the correct voting power");
    }

    modifier givenTheToAddressHasNotDelegatedBefore2() {
        // This is the default state after the non-zero balance is minted.
        // `to` is self-delegated due to `givenTheToAddressHasANonzeroBalance` fix.
        _;
    }

    modifier whenTheToAddressReceivesTokensViaMint4() {
        token.mint(to, 100);
        _;
    }

    function test_WhenTheToAddressThenTransfersToOther3()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasNotDelegatedBefore2
        whenTheToAddressReceivesTokensViaMint4
    {
        // initial state: bal(to)=200, delegates(to)=to, getVotes(to)=200
        vm.prank(to);
        token.transfer(other, 100);
        // final state: bal(to)=100, getVotes(to) = 200-100 = 100
        assertEq(token.getVotes(to), 100, "`to` has the correct voting power");
        assertEq(token.delegates(to), toDelegate, "`to`s delegate has not changed");
        assertEq(token.getVotes(toDelegate), 100, "`to`s delegate has the correct voting power");
    }

    function test_WhenTheToAddressThenDelegatesToOther()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasNotDelegatedBefore2
        whenTheToAddressReceivesTokensViaMint4
    {
        vm.prank(to);
        token.delegate(other);
        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), other, "`to`s delegate is correctly changed");
        assertEq(token.getVotes(other), 200, "`to`s delegate has the correct voting power");
    }

    modifier whenTheToAddressReceivesTokensViaTransferFromFrom4() {
        token.mint(from, 100);
        vm.prank(from);
        token.delegate(from);
        fromDelegate = from;
        vm.prank(from);
        token.transfer(to, 100);
        _;
    }

    function test_WhenTheToAddressThenTransfersToOther4()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasNotDelegatedBefore2
        whenTheToAddressReceivesTokensViaTransferFromFrom4
    {
        vm.prank(to);
        token.transfer(other, 100);

        assertEq(token.getVotes(to), 100, "`to` has the correct voting power");
        assertEq(token.delegates(to), toDelegate, "`to`s delegate has not changed");
        assertEq(token.getVotes(toDelegate), 100, "`to`s delegate has the correct voting power");
    }

    function test_WhenTheToAddressThenDelegatesToOther2()
        external
        givenATokenIsDeployedAndTheMainSignerCanMint2
        givenTheToAddressHasANonzeroBalance
        givenTheToAddressHasNotDelegatedBefore2
        whenTheToAddressReceivesTokensViaTransferFromFrom4
    {
        vm.prank(to);
        token.delegate(other);

        assertEq(token.getVotes(to), 0, "`to` has the correct voting power");
        assertEq(token.delegates(to), other, "`to`s delegate is correctly changed");
        assertEq(token.getVotes(other), 200, "`to`s delegate has the correct voting power");
    }

    modifier givenMintingIsAllowed() {
        // Deploy a fresh token for this test group
        GovernanceERC20.MintSettings memory emptyMintSettings;
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
        dao.grant(address(token), address(this), token.MINT_PERMISSION_ID());
        _;
    }

    function test_GivenCallingMintWithThePermission() external givenMintingIsAllowed {
        // It Should mint properly
        uint256 initialBalance = token.balanceOf(alice);
        uint256 initialSupply = token.totalSupply();

        token.mint(alice, 10 ether);
        assertEq(token.balanceOf(alice), initialBalance + 10 ether);
        assertEq(token.totalSupply(), initialSupply + 10 ether);
    }

    function test_RevertGiven_CallingMintWithoutThePermission() external givenMintingIsAllowed {
        // It Should revert
        uint256 initialBalance = token.balanceOf(alice);
        uint256 initialSupply = token.totalSupply();

        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(token), bob, token.MINT_PERMISSION_ID()
            )
        );
        vm.prank(bob);
        token.mint(alice, 10 ether);
        assertEq(token.balanceOf(alice), initialBalance);
        assertEq(token.totalSupply(), initialSupply);
    }

    function test_GivenCallingFreezeMintingWithThePermission() external givenMintingIsAllowed {
        // It Should disallow mints from then on

        uint256 initialBalance = token.balanceOf(alice);
        uint256 initialSupply = token.totalSupply();

        token.mint(alice, 10 ether);
        assertEq(token.balanceOf(alice), initialBalance + 10 ether);
        assertEq(token.totalSupply(), initialSupply + 10 ether);

        vm.expectEmit();
        emit MintingFrozen();
        token.freezeMinting();

        // KO
        initialBalance = token.balanceOf(alice);
        initialSupply = token.totalSupply();

        vm.expectRevert(MintingIsFrozen.selector);
        token.mint(alice, 10 ether);
        assertEq(token.balanceOf(alice), initialBalance);
        assertEq(token.totalSupply(), initialSupply);
    }

    function test_RevertGiven_CallingFreezeMintingWithoutThePermission() external givenMintingIsAllowed {
        // It Should revert
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(token), bob, token.MINT_PERMISSION_ID()
            )
        );
        vm.prank(bob);
        token.freezeMinting();
    }

    modifier givenMintingIsFrozen() {
        // Deploy a fresh token for this test group
        GovernanceERC20.MintSettings memory emptyMintSettings;
        token = new GovernanceERC20(dao, TOKEN_NAME, TOKEN_SYMBOL, emptyMintSettings);
        dao.grant(address(token), address(this), token.MINT_PERMISSION_ID());
        token.freezeMinting();

        _;
    }

    function test_RevertGiven_CallingMintWithThePermission2() external givenMintingIsFrozen {
        // It Should revert
        vm.expectRevert(MintingIsFrozen.selector);
        token.mint(alice, 10 ether);
    }

    function test_RevertGiven_CallingMintWithoutThePermission2() external givenMintingIsFrozen {
        // It Should revert
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(token), bob, token.MINT_PERMISSION_ID()
            )
        );
        vm.prank(bob);
        token.mint(alice, 10 ether);
    }

    function test_GivenCallingFreezeMintingWithThePermission2() external givenMintingIsFrozen {
        // It Should do nothing
        token.freezeMinting();
    }

    function test_RevertGiven_CallingFreezeMintingWithoutThePermission2() external givenMintingIsFrozen {
        // It Should revert
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), address(token), bob, token.MINT_PERMISSION_ID()
            )
        );
        vm.prank(bob);
        token.freezeMinting();
    }
}
