import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { openingWorkflow, getOpening, manageOpening, respondToOffer } from '../src/workflows';
import type { Client, OpeningInput, OpeningState, SendOfferInput } from '../src/types';

const candidates: Client[] = ['Maya', 'Olivia', 'Jules'].map((name, i) => ({
  id: `client-${i}`, name, mobile: `+1415555010${i}`, service: 'Haircut', stylist: 'Anyone',
  availability: 'Any time', days: [0,1,2,3,4,5,6], joinedAt: `2026-09-${18+i}T10:00:00Z`,
}));

test('Juniper durable appointment lifecycle', { timeout: 120_000 }, async (t) => {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  const deliveries: string[] = [];
  let count = 0;
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'juniper-tests',
    workflowsPath: require.resolve('../src/workflows'), activities: {
      sendOffer: async (args: SendOfferInput) => {
        if (args.fail) throw new Error('Simulated delivery problem');
        deliveries.push(args.offer.id);
      },
    } });
  async function start(overrides: Partial<OpeningInput> = {}) {
    const now = await env.currentTimeMs();
    const input: OpeningInput = { id: `test-${++count}`, service: 'Haircut', stylist: 'Carla',
      startsAt: now + 3_600_000, createdAt: now, responseWindowMs: 900_000,
      demo: false, simulateDeliveryFailure: false, candidates, ...overrides };
    return env.client.workflow.start(openingWorkflow, { workflowId: input.id, taskQueue: 'juniper-tests', args: [input] });
  }
  type Handle = Awaited<ReturnType<typeof start>>;
  async function waitFor(handle: Handle, predicate: (state: OpeningState) => boolean) {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const state = await handle.query(getOpening);
      if (predicate(state)) return state;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error('Expected Workflow state did not arrive');
  }
  const action = (handle: Handle, name: 'cancel_offer' | 'cancel_opening' | 'reopen' | 'retry_delivery', offerId?: string) =>
    handle.executeUpdate(manageOpening, { args: [{ action: name, requestId: `${name}-${Date.now()}-${Math.random()}`, offerId }] });
  try {
    await worker.runUntil(async () => {
      await t.test('15-minute expiry advances; late response rejected; acceptance fills; reopen resumes', async () => {
        const handle = await start();
        const first = await waitFor(handle, (s) => s.phase === 'waiting');
        const firstId = first.currentOfferId!;
        assert.equal(first.offers[0].client.id, candidates[0].id);
        const deadline = first.offers[0].deadline!;
        await env.sleep(Math.max(1, deadline - await env.currentTimeMs() + 1));
        const next = await waitFor(handle, (s) => s.phase === 'waiting' && s.offers.length === 2);
        assert.equal(next.offers[0].status, 'timed_out');
        assert.equal((await handle.executeUpdate(respondToOffer, { args: [{ offerId: firstId, answer: 'accept' }] })).ok, false);
        const replies = await Promise.all([1,2].map(() => handle.executeUpdate(respondToOffer, { args: [{ offerId: next.currentOfferId!, answer: 'accept' }] })));
        assert.ok(replies.every((r) => r.ok));
        assert.equal((await handle.query(getOpening)).offers.filter((o) => o.status === 'accepted').length, 1);
        assert.equal((await action(handle, 'reopen', next.currentOfferId)).ok, true);
        const reopened = await waitFor(handle, (s) => s.phase === 'waiting' && s.offers.length === 3);
        assert.equal(reopened.offers[1].status, 'withdrawn');
        assert.equal((await handle.executeUpdate(respondToOffer, { args: [{ offerId: next.currentOfferId!, answer: 'accept' }] })).ok, false);
        assert.equal((await action(handle, 'cancel_opening')).ok, true);
        assert.equal((await handle.result()).phase, 'canceled');
      });
      await t.test('decline and staff cancellation advance; all exhausted means unfilled', async () => {
        const handle = await start({ candidates: candidates.slice(0, 2) });
        const first = await waitFor(handle, (s) => s.phase === 'waiting');
        await handle.executeUpdate(respondToOffer, { args: [{ offerId: first.currentOfferId!, answer: 'decline' }] });
        const second = await waitFor(handle, (s) => s.phase === 'waiting' && s.offers.length === 2);
        await action(handle, 'cancel_offer', second.currentOfferId);
        const result = await handle.result();
        assert.equal(result.phase, 'unfilled');
        assert.match(result.reason!, /1 declined, 1 canceled by staff/);
      });
      await t.test('delivery fails after bounded retries; staff retry retains the same offer', async () => {
        const handle = await start({ simulateDeliveryFailure: true });
        await env.sleep(5000);
        const failed = await waitFor(handle, (s) => s.phase === 'needs_attention');
        assert.equal(failed.offers.length, 1);
        assert.equal((await action(handle, 'retry_delivery', failed.currentOfferId)).ok, true);
        const retried = await waitFor(handle, (s) => s.phase === 'waiting');
        assert.equal(retried.currentOfferId, failed.currentOfferId);
        assert.equal(retried.offers.length, 1);
        await action(handle, 'cancel_opening');
        await handle.result();
      });
      await t.test('no matches stops without sending a message', async () => {
        const before = deliveries.length;
        const handle = await start({ candidates: [] });
        const result = await handle.result();
        assert.equal(result.phase, 'unfilled');
        assert.match(result.reason!, /No eligible clients/);
        assert.equal(deliveries.length, before);
      });
      await t.test('all timeouts stop with a reason', async () => {
        const handle = await start({ candidates: candidates.slice(0, 1) });
        await waitFor(handle, (s) => s.phase === 'waiting');
        const result = await handle.result();
        assert.equal(result.phase, 'unfilled');
        assert.equal(result.offers[0].status, 'timed_out');
        assert.match(result.reason!, /1 timed out/);
      });
      await t.test('appointment start truncates deadline and stops further outreach', async () => {
        const now = await env.currentTimeMs();
        const handle = await start({ startsAt: now + 30_000 });
        const first = await waitFor(handle, (s) => s.phase === 'waiting');
        assert.ok(first.offers[0].deadline! <= now + 30_000);
        const result = await handle.result();
        assert.equal(result.phase, 'unfilled');
        assert.equal(result.offers.length, 1);
        assert.match(result.reason!, /start time has passed/);
      });
    });
  } finally { await env.teardown(); }
});

test('a replacement Worker recovers an expired offer without resending it', { timeout: 60_000 }, async () => {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  const deliveries: string[] = [];
  const workerOptions = { connection: env.nativeConnection, taskQueue: 'juniper-recovery', maxCachedWorkflows: 0,
    workflowsPath: require.resolve('../src/workflows'), activities: {
      sendOffer: async ({ offer }: SendOfferInput) => { deliveries.push(offer.id); },
    } };
  const firstWorker = await Worker.create(workerOptions);
  const now = await env.currentTimeMs();
  const input: OpeningInput = { id: 'recovery', service: 'Haircut', stylist: 'Carla', startsAt: now + 3_600_000,
    createdAt: now, responseWindowMs: 900_000, demo: false, simulateDeliveryFailure: false, candidates: candidates.slice(0, 2) };
  const handle = await env.client.workflow.start(openingWorkflow, { workflowId: input.id, taskQueue: 'juniper-recovery', args: [input] });
  let deadline = 0;
  try {
    await firstWorker.runUntil(async () => {
      for (let i = 0; i < 200; i++) {
        const state = await env.client.connection.withDeadline(Date.now() + 4000, () => handle.query(getOpening));
        if (state.phase === 'waiting') { deadline = state.offers[0].deadline!; break; }
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      assert.ok(deadline);
    });
    // No Worker is running as the durable response deadline passes.
    await env.sleep(deadline - await env.currentTimeMs() + 1);
    const replacement = await Worker.create(workerOptions);
    await replacement.runUntil(async () => {
      let recovered: OpeningState | undefined;
      for (let i = 0; i < 200; i++) {
        const state = await env.client.connection.withDeadline(Date.now() + 4000, () => handle.query(getOpening));
        if (state.phase === 'waiting' && state.offers.length === 2) { recovered = state; break; }
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      assert.ok(recovered);
      assert.equal(recovered.offers[0].status, 'timed_out');
      assert.equal(recovered.offers[1].client.id, candidates[1].id);
      assert.deepEqual(deliveries, ['recovery-offer-1', 'recovery-offer-2']);
      await handle.executeUpdate(respondToOffer, { args: [{ offerId: recovered.currentOfferId!, answer: 'accept' }] });
      assert.equal((await handle.result()).phase, 'filled');
    });
  } finally { await env.teardown(); }
});
