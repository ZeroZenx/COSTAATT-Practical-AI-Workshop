import assert from 'node:assert/strict';
import worker from '../worker/index.js';

class MemoryD1 {
  participants = new Map();
  rooms = new Map();

  prepare(sql) {
    const db = this;
    let values = [];
    return {
      bind(...bound) { values = bound; return this; },
      async all() {
        if (sql.includes('FROM participants')) {
          return { results: [...db.participants.values()].map(row => ({
            name: row.name,
            role: row.role,
            org: row.organization,
            completed_json: row.completed_json,
            challengeCount: row.challenge_count,
            gameAnswerCount: row.game_answer_count,
          })) };
        }
        throw new Error(`Unexpected all query: ${sql}`);
      },
      async first() {
        if (sql.includes('FROM participants')) {
          const row = db.participants.get(values[0]);
          return row ? { joined_at: row.joined_at, last_seen: row.last_seen } : null;
        }
        if (sql.includes('FROM projection_rooms')) {
          const row = db.rooms.get(values[0]);
          return row && row.expires_at > values[1]
            ? { state_json: row.state_json, updated_at: row.updated_at, expires_at: row.expires_at }
            : null;
        }
        throw new Error(`Unexpected first query: ${sql}`);
      },
      async run() {
        if (sql.startsWith('INSERT INTO participants')) {
          const [id, name, role, organization, , completed_json, challenge_count, game_answer_count, joined_at, last_seen] = values;
          const existing = db.participants.get(id);
          db.participants.set(id, {
            participant_id: id, name, role, organization, completed_json, challenge_count, game_answer_count,
            joined_at: existing?.joined_at || joined_at, last_seen: existing?.last_seen || last_seen,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('DELETE FROM participants WHERE')) {
          return { meta: { changes: Number(db.participants.delete(values[0])) } };
        }
        if (sql === 'DELETE FROM participants') {
          const changes = db.participants.size;
          db.participants.clear();
          return { meta: { changes } };
        }
        if (sql.startsWith('DELETE FROM projection_rooms WHERE expires_at')) {
          let changes = 0;
          for (const [id, row] of db.rooms) if (row.expires_at <= values[0]) { db.rooms.delete(id); changes++; }
          return { meta: { changes } };
        }
        if (sql.startsWith('INSERT INTO projection_rooms')) {
          const [id, state_json, created_at, updated_at, expires_at] = values;
          db.rooms.set(id, { state_json, created_at, updated_at, expires_at });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE projection_rooms')) {
          const [state_json, updated_at, id, now] = values;
          const row = db.rooms.get(id);
          if (!row || row.expires_at <= now) return { meta: { changes: 0 } };
          db.rooms.set(id, { ...row, state_json, updated_at });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('DELETE FROM projection_rooms WHERE room_id')) {
          const [id, now] = values;
          const row = db.rooms.get(id);
          if (!row || row.expires_at <= now) return { meta: { changes: 0 } };
          db.rooms.delete(id);
          return { meta: { changes: 1 } };
        }
        throw new Error(`Unexpected run query: ${sql}`);
      },
    };
  }
}

const db = new MemoryD1();
const env = { DB: db, REMOTE_CONTROL_CODE: 'TESTCODE2226' };
const ownerHeaders = { 'oai-authenticated-user-id': 'test-owner' };
const controlHeaders = { 'x-workshop-control-code': 'TEST-CODE-2226' };
async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const request = new Request(`https://workshop.example${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return worker.fetch(request, env, {});
}

assert.equal((await call('/api/participants')).status, 401, 'anonymous report reads must fail');
assert.equal((await call('/api/participants', { headers: ownerHeaders })).status, 401, 'account sign-in alone must not authorize reports');
assert.equal((await call('/api/participants', { headers: { 'x-workshop-control-code': 'WRONGCODE2226' } })).status, 401, 'incorrect facilitator codes must not authorize reports');

const now = new Date().toISOString();
const participant = { id: 'participant-1', name: 'Example Learner', role: 'Analyst', org: 'Sample Team', consent: true, completed: [0, 1], challenges: 2, gameAnswers: 3, lastSeen: now, joinedAt: now };
assert.equal((await call('/api/participants', { method: 'POST', body: participant })).status, 200, 'participant opt-in writes must work without staff sign-in');
const reportResponse = await call('/api/participants', { headers: controlHeaders });
assert.equal(reportResponse.status, 200);
const report = await reportResponse.json();
assert.deepEqual(report.participants[0], { name: 'Example Learner', role: 'Analyst', org: 'Sample Team', completedCount: 2, challengeCount: 2, gameAnswerCount: 3 });
assert.equal('id' in report.participants[0], false, 'report API must not expose participant identifiers');
assert.equal('lastSeen' in report.participants[0], false, 'report API must not expose activity timestamps');
assert.equal((await call('/api/participants/participant-1', { method: 'DELETE' })).status, 204, 'a participant must be able to withdraw their own record by its browser-held token');
assert.equal((await call('/api/participants', { headers: controlHeaders })).status, 200);
assert.equal((await (await call('/api/participants', { headers: controlHeaders })).json()).participants.length, 0);

const initialProjection = { projection: { session: 0, activity: 0, mode: 'challenge' }, timer: null };
assert.equal((await call('/api/projection/rooms', { method: 'POST', body: initialProjection })).status, 401, 'room creation requires the facilitator code');
assert.equal((await call('/api/projection/rooms', { method: 'POST', headers: ownerHeaders, body: initialProjection })).status, 401, 'account sign-in alone must not control projector rooms');
assert.equal((await call('/api/projection/rooms', { method: 'POST', headers: { 'x-workshop-control-code': 'WRONGCODE2226' }, body: initialProjection })).status, 401, 'an incorrect facilitator code must fail');
const create = await call('/api/projection/rooms', { method: 'POST', headers: controlHeaders, body: initialProjection });
assert.equal(create.status, 201);
const { roomId } = await create.json();
assert.match(roomId, /^[0-9a-f-]{36}$/i);
const display = await call(`/api/projection/rooms/${roomId}`);
assert.equal(display.status, 200, 'projector link must remain readable without sign-in');
assert.deepEqual((await display.json()).state, initialProjection);
assert.equal((await call(`/api/projection/rooms/${roomId}`, { method: 'PUT', body: initialProjection })).status, 401, 'projector visitors without the facilitator code must not control a room');
assert.equal((await call(`/api/projection/rooms/${roomId}`, { method: 'PUT', headers: ownerHeaders, body: initialProjection })).status, 401, 'account sign-in alone must not control a projector room');
const nextProjection = { projection: { session: 1, activity: 2, mode: 'reveal' }, timer: { endAt: null, remaining: 480 } };
assert.equal((await call(`/api/projection/rooms/${roomId}`, { method: 'PUT', headers: controlHeaders, body: nextProjection })).status, 200);
assert.deepEqual((await (await call(`/api/projection/rooms/${roomId}`)).json()).state, nextProjection);
assert.equal((await call(`/api/projection/rooms/${roomId}`, { method: 'PUT', headers: controlHeaders, body: { projection: { session: 99, activity: 0, mode: 'reveal' } } })).status, 400, 'invalid projection values must be rejected');
assert.equal((await call(`/api/projection/rooms/${roomId}`, { method: 'DELETE' })).status, 401, 'ending a room requires the facilitator code');
assert.equal((await call(`/api/projection/rooms/${roomId}`, { method: 'DELETE', headers: controlHeaders })).status, 204);
assert.equal((await call(`/api/projection/rooms/${roomId}`)).status, 404);

assert.equal((await call('/api/participants', { method: 'DELETE' })).status, 401, 'clearing shared reporting requires the facilitator code');
assert.equal((await call('/api/participants', { method: 'DELETE', headers: ownerHeaders })).status, 401, 'account sign-in alone must not clear shared reporting');
assert.equal((await call('/api/participants', { method: 'DELETE', headers: controlHeaders })).status, 204);
console.log('Worker access, opt-in, withdrawal, report minimization, and remote-room checks passed.');
