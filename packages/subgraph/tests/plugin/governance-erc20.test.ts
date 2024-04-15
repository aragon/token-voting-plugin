import {
  handleDelegateChanged,
  handleDelegateVotesChanged,
  handleTransfer,
} from '../../src/plugin/governance-erc20';
import {generateMemberEntityId} from '../../src/utils/ids';
import {ExtendedTokenVotingMember} from '../helpers/extended-schema';
import {getBalanceOf} from '../utils';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ONE_ETH,
  ADDRESS_THREE,
  DAO_TOKEN_ADDRESS,
  ADDRESS_SEVEN,
  CONTRACT_ADDRESS,
} from '../utils/constants';
import {getDelegatee, getVotes} from '../utils/voting';
import {
  generateEntityIdFromAddress,
  generatePluginEntityId,
} from '@aragon/osx-commons-subgraph';
import {Address, BigInt, DataSourceContext} from '@graphprotocol/graph-ts';
import {
  assert,
  afterEach,
  beforeAll,
  clearStore,
  dataSourceMock,
  test,
  describe,
} from 'matchstick-as';

// mock plugins
const pluginAddress = Address.fromString(CONTRACT_ADDRESS);
const pluginEntityId = generatePluginEntityId(pluginAddress);
const secondPluginAddr = Address.fromString(ADDRESS_SEVEN);
const secondPluginEntityId = generatePluginEntityId(secondPluginAddr);

// balances
const STARTING_BALANCE = ONE_ETH + '0'; // 10 ETH
const TRANSFER = ONE_ETH.replace('1', '3'); // 3 ETH
const REMAINING = ONE_ETH.replace('1', '7'); // 7 ETH

// mock members
const fromAccount = ADDRESS_ONE;
const toAccount = ADDRESS_TWO;
const fromAddress = Address.fromString(ADDRESS_ONE);
const memberAddress = fromAddress;
const toAddress = Address.fromString(ADDRESS_TWO);
const thirdAddress = Address.fromString(ADDRESS_THREE);

function setContext(pluginId: string = pluginEntityId): void {
  const context = new DataSourceContext();
  context.setString('pluginId', pluginId);
  dataSourceMock.setContext(context);
}

describe('Governance ERC20', () => {
  beforeAll(() => {
    setContext();
  });

  afterEach(() => {
    clearStore();
  });

  describe('handleTransfer', () => {
    test('it should create a new member of from and to', () => {
      assert.entityCount('TokenVotingMember', 0);

      // initialize the extended class members
      let fromAccountMember = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      let toAccountMember = new ExtendedTokenVotingMember().withDefaultValues(
        toAddress,
        pluginAddress
      );

      // create a new transfer event
      let event = fromAccountMember.createEvent_Transfer(
        fromAccount,
        toAccount
      );

      // mock the calls
      fromAccountMember.mockCall_getBalanceOf(fromAccount);
      fromAccountMember.mockCall_getBalanceOf(toAccount, ONE_ETH);

      fromAccountMember.mockCall_getDelegatee(fromAccount);
      fromAccountMember.mockCall_getDelegatee(toAccount);

      fromAccountMember.mockCall_getVotes(fromAccount);
      fromAccountMember.mockCall_getVotes(toAccount, ONE_ETH);

      // handle the event
      handleTransfer(event);

      // check from account
      assert.entityCount('TokenVotingMember', 2);
      fromAccountMember.delegatee = fromAccountMember.id;
      fromAccountMember.assertEntity();

      // check to account
      toAccountMember.delegatee = toAccountMember.id;
      toAccountMember.balance = BigInt.fromString(ONE_ETH);
      toAccountMember.votingPower = BigInt.fromString(ONE_ETH);
      toAccountMember.assertEntity();
    });

    test('it should update an existing fromAccount and toAccount entity', () => {
      assert.entityCount('TokenVotingMember', 0);

      let fromAccountMember = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      fromAccountMember.balance = BigInt.fromString(ONE_ETH + '0'); // 10 ETH
      fromAccountMember.delegatee = fromAccountMember.id;

      let toAccountMember = new ExtendedTokenVotingMember().withDefaultValues(
        toAddress,
        pluginAddress
      );
      toAccountMember.balance = BigInt.fromString(ONE_ETH); // 1 ETH
      toAccountMember.delegatee = toAccountMember.id;

      // create the from and to members
      fromAccountMember.buildOrUpdate();
      toAccountMember.buildOrUpdate();
      assert.entityCount('TokenVotingMember', 2);

      // create transfer event
      let event = fromAccountMember.createEvent_Transfer(
        fromAccount,
        toAccount
      );

      // mock calls
      fromAccountMember.mockCall_getBalanceOf(fromAccount);
      fromAccountMember.mockCall_getBalanceOf(toAccount, ONE_ETH + '0');

      // handle event
      handleTransfer(event);

      // assert the from account
      // reduce the balance by the transfer
      assert.entityCount('TokenVotingMember', 2);
      fromAccountMember.balance = BigInt.fromString(ONE_ETH).times(
        BigInt.fromString('9')
      );
      fromAccountMember.assertEntity();

      // assert the to account
      // increment the balance by the transfer
      toAccountMember.balance = BigInt.fromString(ONE_ETH).plus(
        BigInt.fromString(ONE_ETH)
      );
      toAccountMember.assertEntity();
    });

    test("it should initialize with the user's existing balance (in different plugins), if has one", () => {
      // initialize the extended class members
      let fromAccountMember = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      fromAccountMember.balance = BigInt.fromString(STARTING_BALANCE);
      fromAccountMember.delegatee = fromAccountMember.id;

      let toAccountMember = new ExtendedTokenVotingMember().withDefaultValues(
        toAddress,
        pluginAddress
      );

      // save the from account member
      fromAccountMember.buildOrUpdate();

      // mock calls
      fromAccountMember.mockCall_getBalanceOf(fromAccount, REMAINING);
      fromAccountMember.mockCall_getBalanceOf(toAccount, TRANSFER);

      fromAccountMember.mockCall_getDelegatee(fromAccount);
      fromAccountMember.mockCall_getDelegatee(toAccount);

      fromAccountMember.mockCall_getVotes(toAccount);

      // create transfer event
      let event = fromAccountMember.createEvent_Transfer(
        fromAccount,
        toAccount,
        TRANSFER
      );

      // check the member entity before handling the event
      fromAccountMember.assertEntity();

      // execute the transfer in current plugin context
      handleTransfer(event);

      // check from and to accounts in current plugin context
      fromAccountMember.balance = BigInt.fromString(REMAINING);
      fromAccountMember.assertEntity();

      toAccountMember.balance = BigInt.fromString(TRANSFER);
      toAccountMember.delegatee = toAccountMember.id;
      toAccountMember.assertEntity();

      // set the context to the second plugin and handle the event
      setContext(secondPluginEntityId);
      handleTransfer(event);

      // build the members in the second plugin context
      let fromAccountMember2ndPlugin =
        new ExtendedTokenVotingMember().withDefaultValues(
          fromAddress,
          secondPluginAddr
        );
      fromAccountMember2ndPlugin.balance = BigInt.fromString(REMAINING);
      fromAccountMember2ndPlugin.delegatee = fromAccountMember2ndPlugin.id;

      let toAccountMember2ndPlugin =
        new ExtendedTokenVotingMember().withDefaultValues(
          toAddress,
          secondPluginAddr
        );
      toAccountMember2ndPlugin.balance = BigInt.fromString(TRANSFER);
      toAccountMember2ndPlugin.delegatee = toAccountMember2ndPlugin.id;

      // check the from and to accounts in the second plugin context
      fromAccountMember2ndPlugin.assertEntity();
      toAccountMember2ndPlugin.assertEntity();

      // set the context back to the first plugin
      setContext();
    });
  });

  describe('handleDelegateChanged', () => {
    beforeAll(() => {
      getBalanceOf(DAO_TOKEN_ADDRESS, fromAddress.toHexString(), '0');
      getBalanceOf(DAO_TOKEN_ADDRESS, toAddress.toHexString(), '0');
      getBalanceOf(DAO_TOKEN_ADDRESS, thirdAddress.toHexString(), '0');

      getVotes(DAO_TOKEN_ADDRESS, fromAddress.toHexString(), '0');
      getVotes(DAO_TOKEN_ADDRESS, toAddress.toHexString(), '0');
      getVotes(DAO_TOKEN_ADDRESS, thirdAddress.toHexString(), '0');

      getDelegatee(DAO_TOKEN_ADDRESS, fromAddress.toHexString(), null);
      getDelegatee(DAO_TOKEN_ADDRESS, toAddress.toHexString(), null);
      getDelegatee(DAO_TOKEN_ADDRESS, thirdAddress.toHexString(), null);
    });

    test('it should create a member from `fromDelegate`.', () => {
      let member = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );

      let event = member.createEvent_DelegateChanged();

      handleDelegateChanged(event);

      member.delegatee = generateMemberEntityId(pluginAddress, memberAddress);
      member.assertEntity();
      assert.entityCount('TokenVotingMember', 1);
    });

    test('it should create a member from `toDelegate`.', () => {
      let member = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );

      let event = member.createEvent_DelegateChanged(
        fromAccount,
        fromAccount,
        toAccount
      );

      handleDelegateChanged(event);

      let expectedDelegatee = generateMemberEntityId(pluginAddress, toAddress);

      member.delegatee = expectedDelegatee;
      member.assertEntity();

      assert.entityCount('TokenVotingMember', 2);
    });

    test('it should create a member for `delegator`, `fromDelegate` and `toDelegate`, and set delegatee as `toDelegate`.', () => {
      let member = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      const oldDelegateeId = ADDRESS_TWO;
      const newDelegateeAddress = Address.fromString(ADDRESS_THREE);
      const newDelegateeId = generateEntityIdFromAddress(newDelegateeAddress);

      let event = member.createEvent_DelegateChanged(
        fromAccount,
        oldDelegateeId,
        newDelegateeId
      );

      handleDelegateChanged(event);

      // assert
      // expected changes
      member.delegatee = generateMemberEntityId(
        pluginAddress,
        newDelegateeAddress
      );
      member.assertEntity();
      assert.entityCount('TokenVotingMember', 3);
    });

    test('it should update delegatee of an existing member', () => {
      let member = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );

      member.buildOrUpdate();
      // there should be one member in the store
      assert.entityCount('TokenVotingMember', 1);

      let delegateeAddress = Address.fromString(ADDRESS_TWO);
      let delegateeId = generateEntityIdFromAddress(delegateeAddress);
      let event = member.createEvent_DelegateChanged(
        // member address is ADDRESS ONE
        fromAccount,
        fromAccount,
        delegateeId
      );

      handleDelegateChanged(event);

      // assert
      // expected changes
      member.delegatee = generateMemberEntityId(
        pluginAddress,
        delegateeAddress
      );
      member.assertEntity();
      // there must be the second member in the store for the delegatee
      assert.entityCount('TokenVotingMember', 2);
    });
  });

  describe('handleDelegateVotesChanged', () => {
    test('it should create member for delegate address', () => {
      let member = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      member.votingPower = BigInt.fromString('100');
      let event = member.createEvent_DelegateVotesChanged('100', '0');

      handleDelegateVotesChanged(event);

      member.delegatee = generateMemberEntityId(pluginAddress, memberAddress);
      member.assertEntity();
      assert.entityCount('TokenVotingMember', 1);
    });

    test('it should update delegateVotes of members', () => {
      let member = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );

      let newBalance = '111';
      let event = member.createEvent_DelegateVotesChanged(newBalance);

      handleDelegateVotesChanged(event);

      // assert
      // expected changes
      member.delegatee = generateMemberEntityId(pluginAddress, memberAddress);
      member.votingPower = BigInt.fromString(newBalance);
      member.assertEntity();
      assert.entityCount('TokenVotingMember', 1);
    });

    test('it should delete a member without voting power and balance and not delegating to another address', () => {
      let memberOne = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      let memberTwo = new ExtendedTokenVotingMember().withDefaultValues(
        toAddress,
        pluginAddress
      );
      /* member one has 100 token delegated to member two*/
      memberOne.balance = BigInt.fromString('100');
      memberOne.votingPower = BigInt.fromString('0');
      /* member two balance is 0 but has 100 voting power from the delegation of member one */
      memberTwo.balance = BigInt.fromString('0');
      memberTwo.votingPower = BigInt.fromString('100');
      /* member three has 100 tokens and none delegated */

      memberOne.buildOrUpdate();
      memberTwo.buildOrUpdate();

      assert.entityCount('TokenVotingMember', 2);

      // member one un-delegates from member two
      let eventOne = memberOne.createEvent_DelegateVotesChanged('100');
      let eventTwo = memberTwo.createEvent_DelegateVotesChanged('0');

      memberTwo.mockCall_delegatesCall(DAO_TOKEN_ADDRESS, toAccount, toAccount);

      handleDelegateVotesChanged(eventOne);
      handleDelegateVotesChanged(eventTwo);

      // assert
      // expected changes
      memberOne.votingPower = BigInt.fromString('100');
      memberOne.assertEntity();
      // member two should be deleted because it has no (balance and voting power) and not delegates to another address.
      assert.notInStore('TokenVotingMember', memberTwo.id);
      assert.entityCount('TokenVotingMember', 1);
    });

    test('it should not delete a member without voting power and balance, but delegating to another address', () => {
      let memberOne = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );
      let memberTwo = new ExtendedTokenVotingMember().withDefaultValues(
        toAddress,
        pluginAddress
      );
      /* member one has 100 token delegated to member two*/
      memberOne.balance = BigInt.fromString('100');

      memberOne.buildOrUpdate();
      memberTwo.buildOrUpdate();

      assert.entityCount('TokenVotingMember', 2);

      // member one un-delegates from member two
      let eventOne = memberOne.createEvent_DelegateVotesChanged('100');
      let eventTwo = memberTwo.createEvent_DelegateVotesChanged('0');

      memberTwo.mockCall_delegatesCall(
        DAO_TOKEN_ADDRESS,
        toAccount,
        fromAccount
      );
      memberTwo.mockCall_getVotes(toAccount, '100');

      handleDelegateVotesChanged(eventOne);
      handleDelegateVotesChanged(eventTwo);

      // assert
      // expected changes
      memberOne.votingPower = BigInt.fromString('100');
      memberOne.assertEntity();

      // memberTwo should not be deleted because it has no (balance and voting power), but it delegates to another address.
      memberTwo.assertEntity();
      assert.entityCount('TokenVotingMember', 2);
    });

    test("it should initialize with the user's existing voting power and delegation, if they have any", () => {
      let memberOne = new ExtendedTokenVotingMember().withDefaultValues(
        fromAddress,
        pluginAddress
      );

      // mock the calls
      memberOne.mockCall_getBalanceOf(fromAccount, STARTING_BALANCE);
      memberOne.mockCall_getBalanceOf(toAccount);

      memberOne.mockCall_getDelegatee(fromAccount);
      memberOne.mockCall_getDelegatee(toAccount);

      memberOne.mockCall_getVotes(fromAccount, STARTING_BALANCE);
      memberOne.mockCall_getVotes(toAccount);

      // delegate to self
      let event = memberOne.createEvent_DelegateChanged(
        fromAccount,
        fromAccount,
        fromAccount,
        DAO_TOKEN_ADDRESS
      );

      handleDelegateChanged(event);

      // assert
      memberOne.votingPower = BigInt.fromString(STARTING_BALANCE);
      memberOne.delegatee = memberOne.id;
      memberOne.balance = BigInt.fromString(STARTING_BALANCE);
      memberOne.assertEntity();

      // now do the delegation in the context of the second plugin
      setContext(secondPluginEntityId);
      handleDelegateChanged(event);

      let memberOne2ndPlugin =
        new ExtendedTokenVotingMember().withDefaultValues(
          fromAddress,
          pluginAddress
        );
      memberOne2ndPlugin.votingPower = BigInt.fromString(STARTING_BALANCE);
      memberOne2ndPlugin.delegatee = memberOne2ndPlugin.id;
      memberOne2ndPlugin.balance = BigInt.fromString(STARTING_BALANCE);
      memberOne2ndPlugin.assertEntity();

      // set the context back to the first plugin
      setContext();
    });
  });
});
