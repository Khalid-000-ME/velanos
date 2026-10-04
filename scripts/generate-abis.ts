/**
 * Extracts the ABIs the apps need from Foundry's build output into
 * `packages/config/src/abis.ts`.
 *
 * Generated rather than hand-written on purpose: a hand-copied ABI drifts the moment a function
 * signature changes, and the failure shows up as a silent decode error at runtime instead of a
 * type error at build time. Run `pnpm contracts:build` to regenerate.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'contracts', 'out');
const TARGET = join(ROOT, 'packages', 'config', 'src', 'abis.ts');

/** `[exported name, solidity file, contract name]` */
const WANTED: ReadonlyArray<readonly [string, string, string]> = [
  ['velanosVaultAbi', 'VelanosVault.sol', 'VelanosVault'],
  ['policyGuardAbi', 'PolicyGuard.sol', 'PolicyGuard'],
  ['agentRegistryAbi', 'AgentRegistry.sol', 'AgentRegistry'],
  ['bondManagerAbi', 'BondManager.sol', 'BondManager'],
  ['violationCourtAbi', 'ViolationCourt.sol', 'ViolationCourt'],
  ['vaultFactoryAbi', 'VaultFactory.sol', 'VaultFactory'],
  ['velanosPriceOracleAbi', 'VelanosPriceOracle.sol', 'VelanosPriceOracle'],
  ['stockSwapAdapterAbi', 'StockSwapAdapter.sol', 'StockSwapAdapter'],
  ['mockPerpAdapterAbi', 'MockPerpAdapter.sol', 'MockPerpAdapter'],
  ['oracleSwapPoolAbi', 'OracleSwapPool.sol', 'OracleSwapPool'],
  ['mockUsdgAbi', 'MockUSDG.sol', 'MockUSDG'],
  ['erc20Abi', 'MockStockToken.sol', 'MockStockToken'],
];

function readAbi(file: string, contract: string): unknown[] {
  const path = join(OUT, file, `${contract}.json`);
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as { abi: unknown[] };
  if (!Array.isArray(artifact.abi)) throw new Error(`${path} has no abi array`);
  return artifact.abi;
}

const banner = `// GENERATED FILE — do not edit.
// Produced by \`scripts/generate-abis.ts\` from contracts/out. Run \`pnpm contracts:build\`.
/* eslint-disable */
`;

const body = WANTED.map(([name, file, contract]) => {
  const abi = readAbi(file, contract);
  return `export const ${name} = ${JSON.stringify(abi, null, 2)} as const;`;
}).join('\n\n');

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, `${banner}\n${body}\n`);
console.log(`wrote ${TARGET} (${WANTED.length} ABIs)`);
