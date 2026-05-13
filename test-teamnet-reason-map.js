function mapReasonToEnum(raw) {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('maternit') || lower.includes('paternit') || lower.includes('parental')) return 'parental_leave';
  if (lower.includes('compassion') || lower.includes('bereave')) return 'compassionate';
  if (lower.includes('study')) return 'study_leave';
  if (lower.includes('train') || lower.includes('course')) return 'training';
  if (lower.includes('sick') || lower.includes('unwell') || lower.includes('illness')) return 'unwell';
  if (lower.includes('annual') || lower.includes('holiday') || lower.includes('leave')) return 'annual_leave';
  return 'other';
}

const cases = [
  ['Annual Leave', 'annual_leave'],
  ['Holiday', 'annual_leave'],
  ['Study Day', 'study_leave'],
  ['Training Course', 'training'],
  ['Training', 'training'],
  ['Sickness', 'unwell'],
  ['Maternity Leave', 'parental_leave'],
  ['Paternity', 'parental_leave'],
  ['Compassionate', 'compassionate'],
  ['Bereavement Leave', 'compassionate'],
  ['Day Off', 'other'],
  ['', 'other'],
  [null, 'other'],
];

let pass = 0, fail = 0;
for (const [input, expected] of cases) {
  const got = mapReasonToEnum(input);
  const ok = got === expected;
  console.log(`${ok ? '✓' : '✗'} mapReasonToEnum(${JSON.stringify(input)}) → ${got}  (expected ${expected})`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass}/${cases.length} pass`);
process.exit(fail > 0 ? 1 : 0);
