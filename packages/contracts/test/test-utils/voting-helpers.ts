import {
  IVoteContainer,
  ProposalCreatedEvent,
} from '../../typechain/src/TokenVoting';
import {TokenVoting} from './typechain-versions';
import {findEvent} from '@aragon/osx-commons-sdk';
import {TestGovernanceERC20} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractReceipt,
  ContractTransaction,
} from 'ethers';
import {ethers} from 'hardhat';

export enum VotingMode {
  Standard,
  EarlyExecution,
  VoteReplacement,
}

export async function voteWithSigners(
  votingContract: Contract,
  proposalId: BigNumber,
  ballot: {
    yes: SignerWithAddress[];
    no: SignerWithAddress[];
    abstain: SignerWithAddress[];
  },
  votes: number | number[] = 10
) {
  const allSigners = [
    ...ballot.yes.map(signer => ({signer, tallyFunction: Tally.yes})),
    ...ballot.no.map(signer => ({signer, tallyFunction: Tally.no})),
    ...ballot.abstain.map(signer => ({signer, tallyFunction: Tally.abstain})),
  ];

  const promises = allSigners.map(async ({signer, tallyFunction}, i) => {
    let v: number;

    if (typeof votes === 'number') v = votes;
    else v = votes[i];

    await votingContract
      .connect(signer)
      .vote(proposalId, tallyFunction(v), false);
  });

  await Promise.all(promises);
}

export async function setBalances(
  token: TestGovernanceERC20,
  balances: {receiver: string; amount: number | BigNumber}[]
) {
  const promises = balances.map(balance =>
    token.setBalance(balance.receiver, balance.amount)
  );
  await Promise.all(promises);
}

export async function setTotalSupply(
  token: TestGovernanceERC20,
  totalSupply: number
) {
  await ethers.provider.send('evm_mine', []);
  const block = await ethers.provider.getBlock('latest');

  const currentTotalSupply: BigNumber = await token.getPastTotalSupply(
    block.number - 1
  );

  await token.setBalance(
    `0x${'0'.repeat(39)}1`, // address(1)
    BigNumber.from(totalSupply).sub(currentTotalSupply)
  );
}

type TallyStruct = IVoteContainer.TallyStruct;

export class Tally {
  abstain: BigNumber;
  yes: BigNumber;
  no: BigNumber;

  constructor({
    yes,
    no,
    abstain,
  }: {
    yes: BigNumberish;
    no: BigNumberish;
    abstain: BigNumberish;
  }) {
    this.abstain = BigNumber.from(abstain);
    this.yes = BigNumber.from(yes);
    this.no = BigNumber.from(no);
  }

  public toStruct(): TallyStruct {
    return {
      abstain: this.abstain,
      yes: this.yes,
      no: this.no,
    };
  }

  public toArray(): number[] {
    return [this.abstain.toNumber(), this.yes.toNumber(), this.no.toNumber()];
  }

  public static fromStruct(tally: TallyStruct): Tally {
    return new Tally({
      abstain: BigNumber.from(tally.abstain).toNumber(),
      yes: BigNumber.from(tally.yes).toNumber(),
      no: BigNumber.from(tally.no).toNumber(),
    });
  }

  public add(tally: Tally): Tally {
    return new Tally({
      abstain: this.abstain.add(tally.abstain).toNumber(),
      yes: this.yes.add(tally.yes).toNumber(),
      no: this.no.add(tally.no).toNumber(),
    });
  }

  public sub(tally: Tally): Tally {
    return new Tally({
      abstain: this.abstain.sub(tally.abstain).toNumber(),
      yes: this.yes.sub(tally.yes).toNumber(),
      no: this.no.sub(tally.no).toNumber(),
    });
  }

  public eq(tally: Tally): boolean {
    return (
      this.abstain.eq(tally.abstain) &&
      this.yes.eq(tally.yes) &&
      this.no.eq(tally.no)
    );
  }

  public gt(tally: Tally): boolean {
    return (
      this.abstain.gt(tally.abstain) &&
      this.yes.gt(tally.yes) &&
      this.no.gt(tally.no)
    );
  }

  public gte(tally: Tally): boolean {
    return (
      this.abstain.gte(tally.abstain) &&
      this.yes.gte(tally.yes) &&
      this.no.gte(tally.no)
    );
  }

  public lt(tally: Tally): boolean {
    return (
      this.abstain.lt(tally.abstain) &&
      this.yes.lt(tally.yes) &&
      this.no.lt(tally.no)
    );
  }

  public lte(tally: Tally): boolean {
    return (
      this.abstain.lte(tally.abstain) &&
      this.yes.lte(tally.yes) &&
      this.no.lte(tally.no)
    );
  }

  public sum(): number {
    return this.yes.add(this.no).add(this.abstain).toNumber();
  }

  public div(divisor: number): Tally {
    return new Tally({
      abstain: this.abstain.div(divisor).toNumber(),
      yes: this.yes.div(divisor).toNumber(),
      no: this.no.div(divisor).toNumber(),
    });
  }

  public isZero(): boolean {
    return this.yes.isZero() && this.no.isZero() && this.abstain.isZero();
  }

  public static empty(): Tally {
    return new Tally({yes: 0, no: 0, abstain: 0});
  }

  public static yes(votes: BigNumberish): Tally {
    return new Tally({yes: votes, no: 0, abstain: 0});
  }

  public static no(votes: BigNumberish): Tally {
    return new Tally({yes: 0, no: votes, abstain: 0});
  }

  public static abstain(votes: BigNumberish): Tally {
    return new Tally({yes: 0, no: 0, abstain: votes});
  }
}

export async function getProposalIdFromTx(
  plugin: TokenVoting,
  tx: ContractTransaction
): Promise<BigNumber> {
  const receipt = await tx.wait();
  return await getProposalIdFromReceipt(plugin, receipt);
}

export async function getProposalIdFromReceipt(
  plugin: TokenVoting,
  receipt: ContractReceipt
): Promise<BigNumber> {
  const event = findEvent<ProposalCreatedEvent>(receipt, 'ProposalCreated');
  return await plugin.getProposalId(
    event.args.startDate,
    event.args.endDate,
    (
      await event.getBlock()
    ).timestamp
  );
}
