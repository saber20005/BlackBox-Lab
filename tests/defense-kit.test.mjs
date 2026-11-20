import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const kit = path.join(repository, 'training-kit/blackbox-defense');
const archive = path.join(repository, 'downloads/blackbox-defense-kit.zip');
const python = process.env.BLACKBOX_PYTHON || 'python3';
const options = { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } };
const digest = value => createHash('sha256').update(value).digest('hex');

async function sourceFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    assert(!entry.isSymbolicLink(), 'training files must not be symlinks');
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result.sort();
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all((await sourceFiles(kit)).map(async relative =>
    [relative, digest(await readFile(path.join(kit, relative)))])));
}

// Enforce the reader's local-only boundary while executing its real entrypoint.
const readerHarness = `import runpy,sys
def guard(event,args):
    if event.startswith('socket.') or event in ('subprocess.Popen','os.system','os.exec','os.posix_spawn'):
        raise RuntimeError('Network/process execution is outside the evidence-reader contract')
sys.addaudithook(guard)
script,mode=sys.argv[1:3]
sys.argv=[script,mode,'--json']
runpy.run_path(script,run_name='__main__')`;
function analyze(directory, mode) {
  return JSON.parse(execFileSync(python, ['-c', readerHarness, path.join(directory, 'analyze.py'), mode], options));
}

test('the downloadable defense kit matches every source file and its manifest', async () => {
  const hashes = await sourceHashes();
  const encoded = execFileSync(python, ['-c', `import hashlib,json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    entries=archive.infolist()
    assert len(entries)==len({entry.filename for entry in entries})
    assert all(entry.filename.startswith('blackbox-defense/') and '..' not in entry.filename.split('/') and not entry.is_dir() for entry in entries)
    print(json.dumps({entry.filename.removeprefix('blackbox-defense/'):hashlib.sha256(archive.read(entry)).hexdigest() for entry in entries}))`, archive], options);
  assert.deepEqual(JSON.parse(encoded), hashes);
  const lines = (await readFile(path.join(kit, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  const manifest = Object.fromEntries(lines.map(line => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, 'manifest records a digest and relative file name');
    return [match[2], match[1]];
  }));
  const { SHA256SUMS, ...content } = hashes;
  assert.deepEqual(manifest, content);
  const learner = await readFile(path.join(kit, 'README-ar.md'), 'utf8');
  const review = await readFile(path.join(kit, 'REVIEW-ar.md'), 'utf8');
  assert(learner.includes('REVIEW-ar.md'));
  assert(review.includes('مراجعة مؤشرات العينات'));
});

test('all four evidence-reader modes produce useful facts without network/process execution or source changes', async () => {
  const before = await sourceHashes();
  const logs = analyze(kit, 'logs');
  assert.equal(logs.event_count, 12);
  assert.equal(logs.session_count, 2);
  assert.deepEqual(logs.sessions_with_multiple_sources, ['session-lab-01']);
  assert.deepEqual(logs.sessions.find(session => session.session_id === 'session-lab-01').sources_without_login_or_mfa, ['198.51.100.20']);
  const integrity = analyze(kit, 'integrity');
  assert.equal(integrity.baseline_matches_manifest, true);
  assert.deepEqual(integrity.changed_settings.map(setting => setting.key), ['audit.enabled','audit.retention_days','session.ttl_minutes']);
  assert.equal(integrity.changes_without_recorded_approval.length, 3);
  const headers = analyze(kit, 'headers');
  assert.equal(headers.before.cookie.secure, false);
  assert.equal(headers.before.cookie.http_only, false);
  assert.equal(headers.after.cookie.secure, true);
  assert.equal(headers.after.cookie.http_only, true);
  assert.equal(headers.after.cookie.same_site, 'Lax');
  const email = analyze(kit, 'email');
  assert.equal(email.messages.length, 2);
  assert(email.messages.every(message => message.attachment_count === 0));
  assert(email.messages.find(message => message.file.endsWith('suspicious.eml')).authentication_results.includes('spf=fail'));
  assert(email.messages.find(message => message.file.endsWith('legitimate.eml')).authentication_results.includes('spf=pass'));
  assert.deepEqual(await sourceHashes(), before);
});

test('missing and malformed copied fixtures fail rather than fabricating an analysis', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'blackbox-evidence-failures-'));
  try {
    const fixture = path.join(directory, 'kit');
    await cp(kit, fixture, { recursive: true });
    await rm(path.join(fixture, 'email/suspicious.eml'));
    let result = spawnSync(python, ['-c', readerHarness, path.join(fixture, 'analyze.py'), 'email'], options);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert(result.stderr.includes('تعذّر تحليل ملفات التدريب'));
    await writeFile(path.join(fixture, 'auth-events.csv'), 'wrong,headers\nnot,a-log\n');
    result = spawnSync(python, ['-c', readerHarness, path.join(fixture, 'analyze.py'), 'logs'], options);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert(result.stderr.includes('رؤوس الأعمدة'));
    await writeFile(path.join(fixture, 'integrity/baseline.sha256'), 'invalid-reference');
    result = spawnSync(python, ['-c', readerHarness, path.join(fixture, 'analyze.py'), 'integrity'], options);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert(result.stderr.includes('بصمة المرجع'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the kit builder reproduces the distributed ZIP in a temporary repository', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'blackbox-evidence-build-'));
  try {
    await mkdir(path.join(directory, 'scripts'));
    await cp(kit, path.join(directory, 'training-kit/blackbox-defense'), { recursive: true });
    const script = path.join(directory, 'scripts/build-defense-kit.py');
    await copyFile(path.join(repository, 'scripts/build-defense-kit.py'), script);
    execFileSync(python, [script], { ...options, cwd: directory });
    assert.equal(digest(await readFile(path.join(directory, 'downloads/blackbox-defense-kit.zip'))), digest(await readFile(archive)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
