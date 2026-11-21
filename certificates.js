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
export function validLearnerName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 70 &&
    !/[\u0000-\u001f\u007f<>]/.test(name);
}
