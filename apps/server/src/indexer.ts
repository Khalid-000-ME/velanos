import { and, eq, sql } from 'drizzle-orm';
import { type Address, type Log, decodeEventLog, parseAbiItem } from 'viem';
import {
  velanosPriceOracleAbi,
  velanosVaultAbi,
  agentRegistryAbi,
  bondManagerAbi,
  vaultFactoryAbi,
  violationCourtAbi,
} from '@velanos/config';
import { RULES, type RuleId } from '@velanos/agent-sdk';
import { db, schema } from './db/index';
import { activeChains, env } from './env';
import { publicClientFor } from './lib/chains';
import { contractOf, readDeployment, symbolIndex } from './lib/deployments';
import { emit, jsonSafe } from './lib/events';
import {
  addPayout,
  appendStep,
  closeIncident,
  findOpenIncident,
  openIncident,
} from './lib/incidents';

/**
 * Polls both chains for protocol logs and keeps the read model current.
 *
 * Polling rather than websockets: testnet RPC endpoints drop subscriptions regularly, and a demo
 * that silently stops updating because a socket died is worse than one that lags two seconds. The
 * cursor is persisted per chain, so a restart resumes rather than replays.
 */
export class Indexer {
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    for (const chain of activeChains()) {
      const deployment = readDeployment(chain.chainId);
      if (!deployment) {
        console.log(`[indexer] ${chain.label}: not deployed yet, skipping`);
        continue;
      }
      await this.ensureCursor(chain.chainId, deployment.deployedAtBlock);
      console.log(`[indexer] ${chain.label}: watching from block ${deployment.deployedAtBlock}`);

      this.timers.push(
        setInterval(() => {
          void this.tick(chain.chainId).catch((e) =>
            console.error(`[indexer] ${chain.label} tick failed:`, (e as Error).message),
          );
        }, env.INDEXER_POLL_MS),
      );
      this.timers.push(
        setInterval(() => {
          void this.snapshotVaults(chain.chainId).catch((e) =>
            console.error(`[indexer] ${chain.label} snapshot failed:`, (e as Error).message),
          );
        }, env.NAV_SNAPSHOT_MS),
      );
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.running = false;
  }

  private async ensureCursor(chainId: number, fromBlock: number): Promise<void> {
    const existing = await db
      .select()
      .from(schema.chainCursors)
      .where(eq(schema.chainCursors.chainId, chainId))
      .limit(1);
    if (existing.length === 0) {
      await db
        .insert(schema.chainCursors)
        .values({ chainId, lastBlock: fromBlock, updatedAt: now() });
    }
  }

  // ───────────────────────────────── polling ──────────────────────────────────

  /**
   * Chains whose scan is still in flight. A public RPC can take longer to answer a batch than the poll
   * interval, and two overlapping ticks would both read the same cursor and index the same range twice,
   * double-counting every slash in it.
   */
  private scanning = new Set<number>();

  private async tick(chainId: number): Promise<void> {
    if (this.scanning.has(chainId)) return;
    this.scanning.add(chainId);
    try {
      await this.scan(chainId);
    } finally {
      this.scanning.delete(chainId);
    }
  }

  private async scan(chainId: number): Promise<void> {
    const client = publicClientFor(chainId);
    const head = Number(await client.getBlockNumber());

    const cursorRows = await db
      .select()
      .from(schema.chainCursors)
      .where(eq(schema.chainCursors.chainId, chainId))
      .limit(1);
    const cursor = cursorRows[0];
    if (!cursor || cursor.lastBlock >= head) return;

    const fromBlock = BigInt(cursor.lastBlock + 1);
    // Batched because public RPCs cap the block span of a single getLogs call.
    const toBlock = BigInt(Math.min(head, cursor.lastBlock + env.LOG_BATCH_BLOCKS));

    await this.indexRange(chainId, fromBlock, toBlock);

    await db
      .update(schema.chainCursors)
      .set({ lastBlock: Number(toBlock), updatedAt: now() })
      .where(eq(schema.chainCursors.chainId, chainId));
  }

  private async indexRange(chainId: number, fromBlock: bigint, toBlock: bigint): Promise<void> {
    const d = readDeployment(chainId);
    if (!d) return;
    const client = publicClientFor(chainId);

    const knownVaults = await this.vaultAddresses(chainId);

    const [factoryLogs, registryLogs, courtLogs, bondLogs, oracleLogs] = await Promise.all([
      client.getLogs({ address: contractOf(d, 'VaultFactory'), fromBlock, toBlock }),
      client.getLogs({ address: contractOf(d, 'AgentRegistry'), fromBlock, toBlock }),
      client.getLogs({ address: contractOf(d, 'ViolationCourt'), fromBlock, toBlock }),
      client.getLogs({ address: contractOf(d, 'BondManager'), fromBlock, toBlock }),
      client.getLogs({ address: contractOf(d, 'VelanosPriceOracle'), fromBlock, toBlock }),
    ]);
    const vaultLogs =
      knownVaults.length > 0
        ? await client.getLogs({ address: knownVaults, fromBlock, toBlock })
        : [];

    await this.handleRegistryLogs(chainId, registryLogs);
    await this.handleFactoryLogs(chainId, factoryLogs);
    await this.handleVaultLogs(chainId, vaultLogs);
    await this.handleCourtLogs(chainId, courtLogs);
    await this.handleBondLogs(chainId, bondLogs);
    await this.handleOracleLogs(chainId, oracleLogs);
  }

  private async vaultAddresses(chainId: number): Promise<Address[]> {
    const rows = await db
      .select({ address: schema.vaults.address })
      .from(schema.vaults)
      .where(eq(schema.vaults.chainId, chainId));
    return rows.map((r) => r.address as Address);
  }

  // ───────────────────────────── log handlers ─────────────────────────────────

  private async handleRegistryLogs(chainId: number, logs: Log[]): Promise<void> {
    for (const log of logs) {
      const decoded = this.decode(agentRegistryAbi, log);
      if (!decoded) continue;

      if (decoded.eventName === 'AgentRegistered') {
        const a = decoded.args as { agentId: bigint; operator: Address; signer: Address; name: string };
        await db
          .insert(schema.agents)
          .values({
            chainId,
            agentId: Number(a.agentId),
            operator: a.operator,
            signer: a.signer,
            name: a.name,
            registeredAt: now(),
          })
          .onConflictDoNothing();
        emit('AgentRegistered', chainId, jsonSafe(a) as Record<string, unknown>, {
          txHash: log.transactionHash ?? undefined,
        });
      }

      if (decoded.eventName === 'SettlementRecorded') {
        const a = decoded.args as { agentId: bigint; cleanSeasons: number; slashCount: number };
        await db
          .update(schema.agents)
          .set({ cleanSeasons: Number(a.cleanSeasons), slashCount: Number(a.slashCount) })
          .where(
            and(eq(schema.agents.chainId, chainId), eq(schema.agents.agentId, Number(a.agentId))),
          );
        emit('SettlementRecorded', chainId, jsonSafe(a) as Record<string, unknown>);
      }
    }
  }

  private async handleFactoryLogs(chainId: number, logs: Log[]): Promise<void> {
    for (const log of logs) {
      const decoded = this.decode(vaultFactoryAbi, log);
      if (decoded?.eventName !== 'VaultCreated') continue;

      const a = decoded.args as {
        vault: Address;
        agentId: bigint;
        kind: number;
        mandateHash: string;
        perpAdapter: Address;
        name: string;
      };
      await db
        .insert(schema.vaults)
        .values({
          chainId,
          address: a.vault,
          agentId: Number(a.agentId),
          name: a.name,
          kind: Number(a.kind),
          mandateHash: a.mandateHash,
          perpAdapter: a.perpAdapter === ZERO ? null : a.perpAdapter,
          createdAtBlock: Number(log.blockNumber ?? 0n),
          updatedAt: now(),
        })
        .onConflictDoNothing();

      await this.refreshVault(chainId, a.vault);
      emit('VaultCreated', chainId, jsonSafe(a) as Record<string, unknown>, {
        vault: a.vault,
        txHash: log.transactionHash ?? undefined,
      });
    }
  }

  private async handleVaultLogs(chainId: number, logs: Log[]): Promise<void> {
    const symbols = symbolIndex(chainId);

    for (const log of logs) {
      const decoded = this.decode(velanosVaultAbi, log);
      if (!decoded) continue;
      const vault = log.address as Address;
      const txHash = log.transactionHash ?? undefined;

      switch (decoded.eventName) {
        case 'IntentExecuted': {
          const a = decoded.args as {
            nonce: bigint;
            kind: number;
            assetIn: Address;
            assetOut: Address;
            amountIn: bigint;
            amountOut: bigint;
            rationaleHash: string;
          };
          const subject = Number(a.kind) === 0 ? a.assetOut : a.assetIn;
          await this.upsertIntent(chainId, vault, a.nonce, {
            status: 'executed',
            kind: Number(a.kind),
            assetIn: a.assetIn,
            assetOut: a.assetOut,
            assetSymbol: symbols[subject.toLowerCase()]?.symbol ?? '',
            amountIn: a.amountIn.toString(),
            amountOut: a.amountOut.toString(),
            rationaleHash: a.rationaleHash,
            txHash,
            blockNumber: Number(log.blockNumber ?? 0n),
            slashed: false,
            ruleId: null,
          });
          emit('IntentExecuted', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }

        case 'IntentRejected': {
          const a = decoded.args as { nonce: bigint; ruleId: number; slashed: boolean };
          const ruleId = Number(a.ruleId) as RuleId;
          await this.upsertIntent(chainId, vault, a.nonce, {
            status: a.slashed ? 'slashed' : 'rejected',
            ruleId,
            slashed: a.slashed,
            txHash,
            blockNumber: Number(log.blockNumber ?? 0n),
          });

          if (a.slashed) {
            const id = await openIncident({
              chainId,
              vault,
              category: 'static_violation',
              ruleId,
              ts: now(),
            });
            await appendStep(id, {
              type: 'GUARD_VERDICT',
              ts: now(),
              txHash,
              label: `Guard verdict: rule ${ruleId} ${RULES[ruleId]?.title ?? 'breach'}`,
              data: { nonce: a.nonce.toString(), ruleId, slashable: true },
            });
          }
          emit('IntentRejected', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }

        case 'IntentIgnored': {
          const a = decoded.args as { nonce: bigint; ruleId: number };
          emit('IntentIgnored', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }

        case 'StateChanged': {
          const a = decoded.args as { from: number; to: number; reason: number };
          await this.refreshVault(chainId, vault);

          const incident = await findOpenIncident(chainId, vault);
          if (incident) {
            await appendStep(incident.id, {
              type: 'STATE_CHANGED',
              ts: now(),
              txHash,
              label: `Vault state: ${STATE_NAMES[Number(a.to)] ?? a.to}`,
              data: jsonSafe(a) as Record<string, unknown>,
            });
            if (Number(a.to) === 6) await closeIncident(incident.id, now());
          }
          emit('StateChanged', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }

        case 'StrikeRecorded': {
          const a = decoded.args as { nonce: bigint; strikesInWindow: number };
          await db
            .update(schema.vaults)
            .set({ strikes: Number(a.strikesInWindow), updatedAt: now() })
            .where(and(eq(schema.vaults.chainId, chainId), eq(schema.vaults.address, vault)));
          emit('StrikeRecorded', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }

        case 'NavSnapshot': {
          const a = decoded.args as { nav: bigint; pricePerShareWad: bigint; hwmWad: bigint; floorWad: bigint };
          await db.insert(schema.navPoints).values({
            chainId,
            vault,
            nav: a.nav.toString(),
            pricePerShareWad: a.pricePerShareWad.toString(),
            hwmWad: a.hwmWad.toString(),
            floorWad: a.floorWad.toString(),
            ts: now(),
          });
          await db
            .update(schema.vaults)
            .set({
              nav: a.nav.toString(),
              pricePerShareWad: a.pricePerShareWad.toString(),
              hwmWad: a.hwmWad.toString(),
              floorWad: a.floorWad.toString(),
              updatedAt: now(),
            })
            .where(and(eq(schema.vaults.chainId, chainId), eq(schema.vaults.address, vault)));
          break;
        }

        case 'CompensationReceived': {
          const a = decoded.args as { amount: bigint; kind: number };
          const incident = await findOpenIncident(chainId, vault);
          if (incident) {
            await appendStep(incident.id, {
              type: Number(a.kind) === 1 ? 'DRAWDOWN_COMPENSATED' : 'LP_CREDITED',
              ts: now(),
              txHash,
              label:
                Number(a.kind) === 1
                  ? 'Bond topped depositors back up to the floor'
                  : 'Penalty credited to depositors',
              data: jsonSafe(a) as Record<string, unknown>,
            });
          }
          emit('CompensationReceived', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }

        case 'Unwound': {
          const a = decoded.args as { asset: Address; amountIn: bigint; settlementOut: bigint };
          const incident = await findOpenIncident(chainId, vault);
          if (incident) {
            const sym = symbols[a.asset.toLowerCase()]?.symbol ?? 'position';
            await appendStep(incident.id, {
              type: 'UNWOUND',
              ts: now(),
              txHash,
              label: `Unwound ${sym} back to settlement`,
              data: jsonSafe(a) as Record<string, unknown>,
            });
          }
          emit('Unwound', chainId, jsonSafe(a) as Record<string, unknown>, { vault, txHash });
          break;
        }
      }
    }

    const touched = new Set(logs.map((l) => (l.address as string).toLowerCase()));
    for (const vault of touched) await this.refreshVault(chainId, vault as Address);
  }

  private async handleCourtLogs(chainId: number, logs: Log[]): Promise<void> {
    for (const log of logs) {
      const decoded = this.decode(violationCourtAbi, log);
      if (!decoded) continue;
      const txHash = log.transactionHash ?? undefined;

      if (decoded.eventName === 'ViolationReported') {
        const a = decoded.args as {
          vault: Address;
          nonce: bigint;
          ruleId: number;
          reporter: Address;
          penaltyPaid: bigint;
          bountyPaid: bigint;
        };
        await db.insert(schema.slashes).values({
          chainId,
          vault: a.vault,
          nonce: a.nonce.toString(),
          ruleId: Number(a.ruleId),
          reporter: a.reporter,
          penaltyPaid: a.penaltyPaid.toString(),
          bountyPaid: a.bountyPaid.toString(),
          kind: 0,
          txHash,
          ts: now(),
        });

        const id = await openIncident({
          chainId,
          vault: a.vault,
          category: 'static_violation',
          ruleId: Number(a.ruleId) as RuleId,
          ts: now(),
        });
        await appendStep(id, {
          type: 'REPORTED',
          ts: now(),
          txHash,
          label: `Reported by ${short(a.reporter)}`,
          data: jsonSafe(a) as Record<string, unknown>,
        });
        await appendStep(id, {
          type: 'SLASHED',
          ts: now(),
          txHash,
          label: `${a.penaltyPaid.toString()} slashed from the agent's bond`,
          data: jsonSafe(a) as Record<string, unknown>,
        });
        await addPayout(id, a.penaltyPaid - a.bountyPaid, a.bountyPaid);

        emit('ViolationReported', chainId, jsonSafe(a) as Record<string, unknown>, {
          vault: a.vault,
          txHash,
        });
      }

      if (decoded.eventName === 'DrawdownTripped') {
        const a = decoded.args as { vault: Address; pricePerShareWad: bigint; floorWad: bigint };
        const id = await openIncident({
          chainId,
          vault: a.vault,
          category: 'drawdown',
          ts: now(),
        });
        await appendStep(id, {
          type: 'GUARD_VERDICT',
          ts: now(),
          txHash,
          label: 'NAV per share fell through the mandated floor — trading halted',
          data: jsonSafe(a) as Record<string, unknown>,
        });
        emit('DrawdownTripped', chainId, jsonSafe(a) as Record<string, unknown>, {
          vault: a.vault,
          txHash,
        });
      }

      if (decoded.eventName === 'DrawdownCompensated') {
        const a = decoded.args as { vault: Address; shortfall: bigint; paid: bigint };
        await db.insert(schema.slashes).values({
          chainId,
          vault: a.vault,
          penaltyPaid: a.paid.toString(),
          kind: 1,
          txHash,
          ts: now(),
        });
        const incident = await findOpenIncident(chainId, a.vault);
        if (incident) await addPayout(incident.id, a.paid, 0n);
        emit('DrawdownCompensated', chainId, jsonSafe(a) as Record<string, unknown>, {
          vault: a.vault,
          txHash,
        });
      }

      if (decoded.eventName === 'LateSettlement') {
        const a = decoded.args as { vault: Address; penaltyPaid: bigint };
        const id = await openIncident({
          chainId,
          vault: a.vault,
          category: 'late_settlement',
          ts: now(),
        });
        await appendStep(id, {
          type: 'SLASHED',
          ts: now(),
          txHash,
          label: 'Agent failed to settle at expiry — penalty taken from the bond',
          data: jsonSafe(a) as Record<string, unknown>,
        });
        await addPayout(id, a.penaltyPaid, 0n);
        emit('LateSettlement', chainId, jsonSafe(a) as Record<string, unknown>, {
          vault: a.vault,
          txHash,
        });
      }
    }
  }

  private async handleBondLogs(chainId: number, logs: Log[]): Promise<void> {
    for (const log of logs) {
      const decoded = this.decode(bondManagerAbi, log);
      if (!decoded) continue;
      const args = decoded.args as { vault?: Address };
      if (args.vault) await this.refreshVault(chainId, args.vault);
      emit(decoded.eventName, chainId, jsonSafe(decoded.args) as Record<string, unknown>, {
        ...(args.vault ? { vault: args.vault } : {}),
        txHash: log.transactionHash ?? undefined,
      });
    }
  }

  private async handleOracleLogs(chainId: number, logs: Log[]): Promise<void> {
    const symbols = symbolIndex(chainId);
    for (const log of logs) {
      const decoded = this.decode(velanosPriceOracleAbi, log);
      if (decoded?.eventName !== 'MarketShock') continue;

      const a = decoded.args as { asset: Address; bps: number; fromUsd8: bigint; toUsd8: bigint };
      await db.insert(schema.marketShocks).values({
        chainId,
        asset: a.asset,
        symbol: symbols[a.asset.toLowerCase()]?.symbol ?? '',
        bps: Number(a.bps),
        fromUsd8: a.fromUsd8.toString(),
        toUsd8: a.toUsd8.toString(),
        txHash: log.transactionHash ?? null,
        ts: now(),
      });
      emit('MarketShock', chainId, jsonSafe(a) as Record<string, unknown>, {
        txHash: log.transactionHash ?? undefined,
      });
    }
  }

  // ─────────────────────────────── read model ─────────────────────────────────

  /**
   * Re-reads a vault's live state rather than deriving it from the log that just arrived.
   *
   * Costs a few RPC calls per event and removes a whole class of bug: a missed or reordered log
   * can no longer leave the UI showing a state the chain disagrees with.
   */
  async refreshVault(chainId: number, vault: Address): Promise<void> {
    const client = publicClientFor(chainId);
    const d = readDeployment(chainId);
    if (!d) return;

    try {
      const [state, freezeReason, frozenAt, settledAt, nav, pps, hwm, floor, violations, strikes, mandate] =
        await Promise.all([
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'state' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'freezeReason' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'frozenAt' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'settledAt' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'navSettlement' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'pricePerShareWad' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'hwmPricePerShareWad' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'floorPricePerShareWad' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'staticViolationCount' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'strikesInWindow' }),
          client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'mandate' }),
        ]);

      const [available, slashed] = (await client.readContract({
        address: contractOf(d, 'BondManager'),
        abi: bondManagerAbi,
        functionName: 'bondOf',
        args: [vault],
      })) as readonly [bigint, bigint, bigint];
      const staked = (await client.readContract({
        address: contractOf(d, 'BondManager'),
        abi: bondManagerAbi,
        functionName: 'stakedTotal',
        args: [vault],
      })) as bigint;

      const m = mandate as Record<string, unknown> & { settlementAsset: Address };
      const settlement = Object.values(d.assets).find(
        (a) => a.address.toLowerCase() === m.settlementAsset.toLowerCase(),
      );

      await db
        .update(schema.vaults)
        .set({
          state: Number(state),
          freezeReason: Number(freezeReason),
          frozenAt: Number(frozenAt),
          settledAt: Number(settledAt),
          nav: (nav as bigint).toString(),
          pricePerShareWad: (pps as bigint).toString(),
          hwmWad: (hwm as bigint).toString(),
          floorWad: (floor as bigint).toString(),
          bondAvailable: available.toString(),
          bondSlashed: slashed.toString(),
          bondStaked: staked.toString(),
          staticViolations: Number(violations),
          strikes: Number(strikes),
          settlementAsset: m.settlementAsset,
          settlementSymbol: settlement?.symbol ?? '',
          settlementDecimals: settlement?.decimals ?? 6,
          mandateJson: JSON.stringify(jsonSafe(mandate)),
          updatedAt: now(),
        })
        .where(and(eq(schema.vaults.chainId, chainId), eq(schema.vaults.address, vault)));

      await this.refreshPositions(chainId, vault, Number(state));
    } catch (e) {
      console.error(`[indexer] refreshVault ${vault} failed:`, (e as Error).message);
    }
  }

  /**
   * Values each holding in the settlement asset, the same way the vault's own NAV does: the oracle
   * price is 8-decimal USD and the settlement asset is pinned at $1, so the amount converts straight
   * through. Exposure is that value against NAV, which is what the per-asset cap is measured on — it
   * used to be written as a hard zero, so the cockpit's exposure bar was always empty.
   */
  private async refreshPositions(chainId: number, vault: Address, _state: number): Promise<void> {
    const client = publicClientFor(chainId);
    const symbols = symbolIndex(chainId);

    try {
      const oracle = contractOf(readDeployment(chainId)!, 'VelanosPriceOracle');
      const [held, nav, settlementDecimals] = await Promise.all([
        client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'heldAssetsList' }) as Promise<readonly Address[]>,
        client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'navSettlement' }) as Promise<bigint>,
        client.readContract({ address: vault, abi: velanosVaultAbi, functionName: 'decimals' }) as Promise<number>,
      ]);

      for (const asset of held) {
        const amount = (await client.readContract({
          address: asset,
          abi: [parseAbiItem('function balanceOf(address) view returns (uint256)')],
          functionName: 'balanceOf',
          args: [vault],
        })) as bigint;

        const meta = symbols[asset.toLowerCase()];
        let valueSettlement = 0n;
        if (amount > 0n && meta) {
          try {
            const [priceUsd8] = (await client.readContract({
              address: oracle,
              abi: velanosPriceOracleAbi,
              functionName: 'price',
              args: [asset],
            })) as readonly [bigint, bigint];
            valueSettlement =
              (amount * priceUsd8 * 10n ** BigInt(settlementDecimals)) /
              (10n ** BigInt(meta.decimals) * 100_000_000n);
          } catch {
            /* an asset the oracle does not price yet values at zero rather than failing the sweep */
          }
        }
        const exposureBps = nav > 0n ? Number((valueSettlement * 10_000n) / nav) : 0;

        await db
          .insert(schema.positions)
          .values({
            chainId,
            vault,
            asset,
            symbol: meta?.symbol ?? '',
            amount: amount.toString(),
            valueSettlement: valueSettlement.toString(),
            exposureBps,
            updatedAt: now(),
          })
          .onConflictDoUpdate({
            target: [schema.positions.chainId, schema.positions.vault, schema.positions.asset],
            set: {
              amount: amount.toString(),
              valueSettlement: valueSettlement.toString(),
              exposureBps,
              updatedAt: now(),
            },
          });
      }
    } catch {
      /* a vault mid-unwind can transiently fail these reads; the next tick retries */
    }
  }

  /** Writes a NAV point even when nothing happened, so charts have a continuous line. */
  private async snapshotVaults(chainId: number): Promise<void> {
    const rows = await db
      .select()
      .from(schema.vaults)
      .where(and(eq(schema.vaults.chainId, chainId), sql`${schema.vaults.state} != 6`));

    for (const row of rows) {
      await this.refreshVault(chainId, row.address as Address);
      const fresh = await db
        .select()
        .from(schema.vaults)
        .where(and(eq(schema.vaults.chainId, chainId), eq(schema.vaults.address, row.address)))
        .limit(1);
      const v = fresh[0];
      if (!v) continue;

      await db.insert(schema.navPoints).values({
        chainId,
        vault: v.address,
        nav: v.nav,
        pricePerShareWad: v.pricePerShareWad,
        hwmWad: v.hwmWad,
        floorWad: v.floorWad,
        ts: now(),
      });
    }
  }

  // ─────────────────────────────── helpers ────────────────────────────────────

  private async upsertIntent(
    chainId: number,
    vault: Address,
    nonce: bigint,
    values: Partial<typeof schema.intents.$inferInsert>,
  ): Promise<void> {
    await db
      .insert(schema.intents)
      .values({
        chainId,
        vault,
        nonce: nonce.toString(),
        status: values.status ?? 'executed',
        ts: now(),
        ...values,
      })
      .onConflictDoUpdate({
        target: [schema.intents.chainId, schema.intents.vault, schema.intents.nonce],
        set: { ...values, ts: now() },
      });
  }

  private decode(
    abi: readonly unknown[],
    log: Log,
  ): { eventName: string; args: Record<string, unknown> } | undefined {
    try {
      // Throws for any log this ABI does not describe, which is expected: the indexer fetches
      // every log from an address rather than filtering by topic, so "not mine" is the normal
      // outcome and is simply skipped.
      const decoded = decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics });
      return {
        eventName: decoded.eventName as unknown as string,
        args: (decoded.args ?? {}) as Record<string, unknown>,
      };
    } catch {
      return undefined;
    }
  }
}

const ZERO = '0x0000000000000000000000000000000000000000';
const STATE_NAMES = [
  'PENDING_BOND',
  'ACTIVE',
  'WARNED',
  'FROZEN',
  'UNWINDING',
  'EXPIRED',
  'SETTLED',
];

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const indexer = new Indexer();
