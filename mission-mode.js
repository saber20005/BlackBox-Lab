import { tracks } from './data.js';
import { hasMeaningfulDocumentation } from './assets/modules/training/documentation-templates.js';

export const MISSIONS = Object.freeze([
  { id: 'network-investigator', title: 'محقق الشبكات', description: 'اعزل البيئة، حلّل الشبكة، ثم وثّق استنتاجًا دفاعيًا.', steps: [{ trackId: 'recon', stageIndex: 0 }, { trackId: 'network', stageIndex: 1 }, { trackId: 'network', stageIndex: 2 }] },
  { id: 'web-analyst', title: 'محلل تطبيقات الويب', description: 'شغّل هدفًا تدريبيًا محليًا، راجع طلبًا، ثم وثّق إصلاحًا.', steps: [{ trackId: 'webgoat', stageIndex: 0 }, { trackId: 'proxy', stageIndex: 1 }, { trackId: 'webgoat', stageIndex: 2 }] },
  { id: 'service-review', title: 'مراجع الخدمات', description: 'ابدأ بتحديد النطاق ثم راجع خدمات هدفك التدريبي وتقريرها.', steps: [{ trackId: 'recon', stageIndex: 0 }, { trackId: 'nmap', stageIndex: 1 }, { trackId: 'nmap', stageIndex: 2 }] },
]);

const catalog = new Map(tracks.map(track => [track.id, track]));
export function missionStatus(mission, progress) {
  const steps = mission.steps.map(({ trackId, stageIndex }) => {
    const track = catalog.get(trackId);
    const stage = track?.stages[stageIndex];
    if (!stage) throw new Error('Unknown mission stage');
    const key = trackId + '-' + stageIndex;
    const available = stageIndex === 0 || Boolean(progress?.completed?.[trackId + '-' + (stageIndex - 1)]);
    return {
      trackId, stageIndex, title: stage.name, trackName: track.name,
      completed: Boolean(progress?.completed?.[key]),
      documented: hasMeaningfulDocumentation(progress?.results?.[key]) || hasMeaningfulDocumentation(progress?.notes?.[key]),
      available,
      href: './?track=' + encodeURIComponent(trackId) + (available ? '&stage=' + stageIndex : ''),
    };
  });
  return { ...mission, steps, completed: steps.filter(step => step.completed).length,
    total: steps.length, finished: steps.every(step => step.completed) };
}

export function skillDNA(progress) {
  return tracks.map(track => {
    const stages = track.stages.map((stage, index) => {
      const key = track.id + '-' + index;
      return {
        completed: Boolean(progress?.completed?.[key]),
        documented: hasMeaningfulDocumentation(progress?.notes?.[key]) || hasMeaningfulDocumentation(progress?.results?.[key]),
      };
    });
    const completed = stages.filter(stage => stage.completed).length;
    const documented = stages.filter(stage => stage.completed && stage.documented).length;
    return { id: track.id, name: track.name, completed, documented, total: stages.length,
      percent: stages.length ? Math.round(100 * completed / stages.length) : 0 };
  });
}
