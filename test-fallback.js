const { predictDemand } = require('./lib/demandPredictor.js');
const date = new Date('2026-04-08T12:00:00');
// 1. No options at all
const r1 = predictDemand(date, null);
console.log('1. No options: pred=' + r1.predicted + ' fallback=' + r1.usingFallback + ' scale=' + r1.fallbackScale);
// 2. Half-list (5500 patients)
const r2 = predictDemand(date, null, { listSize: 5500 });
console.log('2. listSize=5500: pred=' + r2.predicted + ' fallback=' + r2.usingFallback + ' scale=' + r2.fallbackScale);
// 3. Larger list (18000 patients)
const r3 = predictDemand(date, null, { listSize: 18000 });
console.log('3. listSize=18000: pred=' + r3.predicted + ' fallback=' + r3.usingFallback + ' scale=' + r3.fallbackScale);
// 4. With demandSettings — should not be fallback
const r4 = predictDemand(date, null, { demandSettings: { baseline: 200, dowEffects: [0,0,0,0,0], monthEffects: [0,0,0,0,0,0,0,0,0,0,0,0] } });
console.log('4. With settings: pred=' + r4.predicted + ' fallback=' + r4.usingFallback);
