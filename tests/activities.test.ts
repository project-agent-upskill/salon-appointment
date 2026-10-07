import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Message, SendOfferInput } from '../src/types';

test('the SMS adapter persists one private link per offer across retries', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'juniper-activity-test-'));
  process.env.JUNIPER_DB = path.join(dir, 'test.sqlite');
  const { sendOffer } = await import('../src/activities');
  const { db, messages } = await import('../src/db');
  const client = { id: 'a', name: 'Sample Client', mobile: '+14155550101', service: 'Haircut' as const, stylist: 'Anyone' as const, availability: 'Any time' as const, days: [3], joinedAt: '2026-09-18T00:00:00Z' };
  const args: SendOfferInput = {
    opening: { id: 'adapter-test', service: 'Haircut', stylist: 'Carla', startsAt: Date.now() + 3_600_000, createdAt: Date.now(), responseWindowMs: 900_000, demo: false, simulateDeliveryFailure: false, candidates: [client] },
    offer: { id: 'adapter-offer', client, status: 'sending', createdAt: Date.now() }, fail: true,
  };
  try {
    await assert.rejects(sendOffer(args), /delivery failure/);
    const failed: Message = messages()[0];
    assert.equal(failed.delivered, false);
    await sendOffer({ ...args, fail: false });
    await sendOffer({ ...args, fail: false });
    const sent = messages();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].delivered, true);
    assert.equal(sent[0].token, failed.token);
    assert.equal(sent[0].token.length, 48);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
