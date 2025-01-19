

import {Wrapper} from '../test/test-utils/wrapper';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export type VerifyEntry = {
  address: string;
  args?: unknown[];
};

declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    wrapper: Wrapper;
    aragonToVerifyContracts: VerifyEntry[];
  }
}

