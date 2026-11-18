import { MISSIONS, missionStatus, skillDNA } from './mission-mode.js';
import { loadProgress } from './progress.js';

const { state, ok, message } = loadProgress();
document.getElementById('storage-status').textContent = message + (ok ? '' : ' لا يمكن ضمان حفظ التغييرات.');
const missions = document.getElementById('missions');
const skills = document.getElementById('skills');
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
for (const mission of MISSIONS) {
  const status = missionStatus(mission, state);
  const card = element('section', undefined, 'panel');
  card.append(element('h3', status.title), element('p', status.description),
    element('p', status.completed + ' / ' + status.total + ' مراحل مؤكدة يدويًا'));
  const list = element('ol');
  for (const step of status.steps) {
    const item = element('li');
    const link = element('a', step.trackName + ' — ' + step.title);
    link.href = step.href;
    item.append(link, element('small', ' · ' + (step.completed ? 'مؤكدة' : 'غير مكتملة') +
      (step.documented ? ' · يوجد توثيق' : ' · دون توثيق')));
    list.append(item);
  }
  card.append(list);
  missions.append(card);
}
for (const skill of skillDNA(state)) {
  const card = element('section', undefined, 'panel');
  card.append(element('h3', skill.name), element('p', skill.completed + '/' + skill.total +
    ' مراحل · ' + skill.documented + ' مكتملة وموثقة'));
  const bar = element('progress');
  bar.max = 100; bar.value = skill.percent;
  bar.setAttribute('aria-label', 'نسبة المراحل المؤكدة في ' + skill.name);
  card.append(bar, element('small', ' ' + skill.percent + '%'));
  skills.append(card);
}
