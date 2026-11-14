import test from 'node:test';
import assert from 'node:assert/strict';

const project = 'demo-blackbox-account-tests';
const endpoint = process.env.FUNCTIONS_EMULATOR_HOST;
if (!endpoint) {
  test('Callable integration requires Functions emulator', { skip: true }, () => {});
} else {
  const base = `http://${endpoint}/${project}/us-central1`;
  for (const fn of ['startGradingSession', 'submitGradingAnswer']) {
    test(`${fn} rejects requests without Firebase Auth`, async () => {
      const response = await fetch(`${base}/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { caseId: 'INC-0001', answer: 'correct' } })
      });
      assert.notEqual(response.status, 200, 'anonymous request must never succeed');
      assert.ok([401, 403].includes(response.status), `expected authentication rejection, got ${response.status}`);
    });
  }
  test('forged bearer token cannot authenticate a callable', async () => {
    const response = await fetch(`${base}/startGradingSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer forged.invalid.token' },
      body: JSON.stringify({ data: { caseId: 'INC-0001' } })
    });
    assert.ok([401, 403].includes(response.status), `forged token accepted or unexpected status: ${response.status}`);
  });

  test('authenticated user without App Check is rejected before challenge validation', async () => {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    assert.ok(authHost, 'Auth emulator host required');
    const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    assert.equal(signup.status, 200);
    const { idToken } = await signup.json();
    assert.ok(idToken);
    // Exercise both callable handlers with a real Auth-emulator identity but no App Check.
    for (const fn of ['startGradingSession', 'submitGradingAnswer']) {
      const response = await fetch(`${base}/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ data: { caseId: 'INC-0001', answer: 'correct' } })
      });
      assert.equal(response.status, 401, `missing App Check must block ${fn}`);
    }
    for (const caseId of ['INC-1', 'INC-9999']) {
      const response = await fetch(`${base}/startGradingSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ data: { caseId } })
      });
      assert.equal(response.status, 401, `missing App Check must be rejected for ${caseId}`);
      assert.notEqual(response.status, 200);
    }
  });

  test('emulator Auth and App Check headers complete a grading round trip', async () => {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    assert.ok(authHost);
    const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    assert.equal(signup.status, 200);
    const { idToken, localId } = await signup.json();
    assert.ok(idToken && localId);
    // Emulator-only synthetic token; NOT a valid production App Check attestation.
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const appCheckToken = [encode({ alg: 'none', typ: 'JWT' }), encode({
      aud: ['projects/demo-blackbox-account-tests'], iss: 'https://firebaseappcheck.googleapis.com/demo-blackbox-account-tests',
      sub: 'demo-blackbox-app', app_id: 'demo-blackbox-app', exp: Math.floor(Date.now() / 1000) + 3600
    }), 'emulator-signature'].join('.');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      'X-Firebase-AppCheck': appCheckToken
    };
    const caseId = 'INC-0458';
    const start = await fetch(`${base}/startGradingSession`, {
      method: 'POST', headers, body: JSON.stringify({ data: { caseId } })
    });
    // If the emulator rejects the synthetic token, fail visibly rather than silently skipping.
    assert.equal(start.status, 200, `start callable rejected emulator token: ${start.status} ${await start.text()}`);
    const started = (await start.json()).result;
    assert.ok(started?.sessionId);
    const submit = async answer => fetch(`${base}/submitGradingAnswer`, {
      method: 'POST', headers, body: JSON.stringify({ data: { caseId, sessionId: started.sessionId, answer } })
    });
    const response = await submit('correct');
    assert.equal(response.status, 200, `submit callable failed: ${response.status} ${await response.text()}`);
    assert.equal((await response.json()).result?.score, 70);
    const replay = await submit('correct');
    assert.notEqual(replay.status, 200, 'replayed session must fail');
  });

}
