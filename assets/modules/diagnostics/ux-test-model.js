// Aggregate only self-reported task outcomes; no user identity or automatic behavior capture.
export function summarizeUX({tasks,ease}) {
 if(!Array.isArray(tasks)||tasks.length!==3||tasks.some(v=>!['success','partial','failed'].includes(v)))throw new TypeError('Invalid task outcomes');
 if(!Number.isInteger(ease)||ease<1||ease>5)throw new TypeError('Invalid ease rating');
 return {completedWithoutHelp:tasks.filter(v=>v==='success').length,totalTasks:3,completionRatePercent:Math.round(tasks.filter(v=>v==='success').length/3*100),ease};
}
