import { MISSIONS, missionStatus, skillDNA } from './mission-mode.js';
import { createProgressSession } from './progress-session.js';

const missions = document.getElementById('missions');
const skills = document.getElementById('skills');
const statusNode = document.getElementById('progress-session-status');
const refreshButton = document.querySelector('[data-progress-refresh]');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render(snapshot) {
  statusNode.textContent = snapshot.message;
  statusNode.dataset.scope = snapshot.scope;
  statusNode.dataset.phase = snapshot.phase;
  statusNode.dataset.fromCache = String(snapshot.fromCache);
  statusNode.dataset.pending = String(snapshot.pending);
  refreshButton.disabled = ['restoring', 'loading'].includes(snapshot.phase);
  missions.replaceChildren();
  skills.replaceChildren();
  const loading = ['restoring', 'loading'].includes(snapshot.phase);
  missions.setAttribute('aria-busy', String(loading));
  skills.setAttribute('aria-busy', String(loading));
  if (!snapshot.progress || loading) return;
  const state = snapshot.progress;
  for (const mission of MISSIONS) {
    const status = missionStatus(mission, state);
    const card = element('section', undefined, 'panel');
    card.dataset.missionId = mission.id;
    card.append(element('h3', status.title), element('p', status.description),
      element('p', status.completed + ' / ' + status.total + ' مراحل مؤكدة يدويًا'));
    const list = element('ol');
    for (const step of status.steps) {
      const item = element('li');
      const link = element('a', step.trackName + ' — ' + step.title);
      link.href = step.href;
      item.append(link, element('small', ' · ' + (step.completed ? 'مؤكدة يدويًا' : 'غير مكتملة') +
        (step.documented ? ' · يوجد توثيق' : ' · دون توثيق') +
        (step.available ? '' : ' · افتح المسار لإكمال المرحلة السابقة')));
      list.append(item);
    }
    card.append(list);
    missions.append(card);
  }
  for (const skill of skillDNA(state)) {
    const card = element('section', undefined, 'panel');
    card.dataset.skillId = skill.id;
    card.append(element('h3', skill.name), element('p', skill.completed + '/' + skill.total +
      ' مراحل مؤكدة يدويًا · ' + skill.documented + ' مكتملة وموثقة'));
    const bar = element('progress');
    bar.max = 100; bar.value = skill.percent;
    bar.setAttribute('aria-label', 'نسبة المراحل المؤكدة يدويًا في ' + skill.name);
    card.append(bar, element('small', ' ' + skill.percent + '%'));
    skills.append(card);
  }
}

const session = createProgressSession({ onChange: render });
render(session.getSnapshot());
refreshButton.addEventListener('click', () => { void session.refresh(); });
window.addEventListener('pageshow', event => { if (event.persisted) void session.refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void session.refresh();
});
window.addEventListener('pagehide', event => { if (!event.persisted) session.dispose(); });
void session.start();
