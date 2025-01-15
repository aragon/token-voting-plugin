

import {Wrapper} from '../test/test-utils/wrapper';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    wrapper: Wrapper;
  }
}