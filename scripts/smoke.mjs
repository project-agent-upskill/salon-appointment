// Exercises the public API against the running local prototype. No real SMS.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.JUNIPER_URL ?? 'http://localhost:3000';
const request = async (path, body) => {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
};
const poll = async (predicate, timeout = 40_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const { data } = await request('/api/openings');
    const result = data.find(predicate);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Opening did not reach expected state');
};
const config = (await request('/api/config')).data;
assert.equal(config.timezone, 'America/Los_Angeles');
const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, hour: '2-digit', hourCycle: 'h23' }).format(Date.now()));
const id = randomUUID();
const create = await request('/api/openings', { service: 'Haircut', stylist: 'Carla', time: `${String(Math.min(23, hour + 2)).padStart(2,'0')}:55`, demo: true, requestId: id });
assert.equal(create.status, 201);
const first = await poll((v) => v.state.input.id === id && v.state.phase === 'waiting');
const firstId = first.state.currentOfferId;
const firstUrl = first.offerUrls[firstId];
const token = firstUrl.split('/').at(-1);
const clientView = await request(`/api/offers/${token}`);
assert.equal(clientView.status, 200);
assert.ok(!('offers' in clientView.data));
assert.ok(!('mobile' in clientView.data));
console.log('Created opening; client endpoint exposes only this offer. Waiting for durable timeout…');
const second = await poll((v) => v.state.input.id === id && v.state.phase === 'waiting' && v.state.offers.length === 2);
assert.equal(second.state.offers[0].status, 'timed_out');
assert.equal((await request(`/api/offers/${token}/respond`, { answer: 'accept' })).status, 409);
const nextToken = second.offerUrls[second.state.currentOfferId].split('/').at(-1);
const replies = await Promise.all([1,2].map(() => request(`/api/offers/${nextToken}/respond`, { answer: 'accept' })));
assert.ok(replies.every((r) => r.status === 200));
const filled = await poll((v) => v.state.input.id === id && v.state.phase === 'filled');
assert.equal(filled.state.offers.filter((o) => o.status === 'accepted').length, 1);
assert.equal((await request(`/api/openings/${id}/actions`, { action: 'reopen', requestId: randomUUID(), offerId: filled.state.currentOfferId })).status, 200);
await poll((v) => v.state.input.id === id && v.state.phase === 'waiting' && v.state.offers.length === 3);
assert.equal((await request(`/api/offers/${nextToken}/respond`, { answer: 'accept' })).status, 409);
await request(`/api/openings/${id}/actions`, { action: 'cancel_opening', requestId: randomUUID() });
await poll((v) => v.state.input.id === id && v.state.phase === 'canceled');
console.log('PASS: timeout, late rejection, repeated acceptance, reopen, withdrawn-link rejection, and cancellation.');
