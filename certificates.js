import { tracks } from './data.js';
import { normalizeState } from './progress.js';

export const DRAFT_NOTICE = 'إفادة إتمام تدريب غير موثّقة، تعتمد على تأكيد المتدرّب اليدوي لإنجاز المراحل. ليست شهادة مهارة خاضعة لتقييم خادمي أو اعتمادًا مهنيًا.';

export function completedTrainingTracks(progress) {
  const state = normalizeState(progress);
  return tracks.flatMap(track => {
    const dates = track.stages.map((_, index) => state.completed[track.id + '-' + index]);
    if (!dates.every(Boolean)) return [];
    return [{
      trackId: track.id,
      title: track.name,
      stageCount: track.stages.length,
      completedAt: dates.map(date => Date.parse(date)).sort((a, b) => b - a)[0],
    }];
  });
}

// Completion records are issued per coherent learning group, never per
// individual exercise or isolated 3-stage track. Existing progress keys stay intact.
export const TRAINING_CERTIFICATE_GROUPS = Object.freeze([
  { id: 'network-foundations', title: 'الشبكات والاستطلاع', trackIds: ['recon', 'nmap', 'network'] },
  { id: 'practical-assessment', title: 'الأدوات والتقييم العملي', trackIds: ['webgoat', 'proxy', 'metasploit'] },
  { id: 'defensive-analysis', title: 'التحليل الدفاعي والأدلة', trackIds: ['logs', 'integrity', 'headers', 'email'] },
]);

export function trainingCertificateGroups(progress) {
  const state = normalizeState(progress);
  return TRAINING_CERTIFICATE_GROUPS.map(group => {
    const members = group.trackIds.map(id => tracks.find(track => track.id === id)).filter(Boolean);
    const stamps = members.flatMap(track => track.stages.map((_, index) => state.completed[`${track.id}-${index}`]));
    const confirmed = stamps.filter(Boolean);
    const complete = members.length === group.trackIds.length && stamps.length > 0 && confirmed.length === stamps.length;
    return {
      id: group.id, title: group.title, trackCount: members.length,
      stageCount: stamps.length, completedStages: confirmed.length, complete,
      completedAt: complete ? Math.max(...stamps.map(stamp => Date.parse(stamp))) : null,
    };
  });
}

export function completedTrainingGroups(progress) {
  return trainingCertificateGroups(progress).filter(group => group.complete);
}

export function validLearnerName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 70 &&
    [...name].every(character => { const point = character.codePointAt(0); return point >= 32 && point !== 127 && character !== '<' && character !== '>'; });
}
