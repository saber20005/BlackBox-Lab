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
}
