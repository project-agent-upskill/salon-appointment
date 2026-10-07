import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchClients } from '../src/matching';
import type { Client } from '../src/types';
const base: Client = { id: 'a', name: 'A', mobile: '1234567890', service: 'Haircut', stylist: 'Anyone', availability: 'Any time', days: [3], joinedAt: '2026-09-20T00:00:00Z' };
test('eligibility and FIFO use the salon timezone', () => {
  const list: Client[] = [base,
    { ...base, id: 'earlier', joinedAt: '2026-09-18T00:00:00Z', availability: 'Afternoon' },
    { ...base, id: 'wrong-service', service: 'Blowout' },
    { ...base, id: 'wrong-stylist', stylist: 'Lena' },
    { ...base, id: 'wrong-time', availability: 'Morning' },
    { ...base, id: 'wrong-day', days: [4] }];
  assert.deepEqual(matchClients(list, 'Haircut', 'Carla', Date.parse('2026-10-07T21:00:00Z')).map((c) => c.id), ['earlier', 'a']);
});
