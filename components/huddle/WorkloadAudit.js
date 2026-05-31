'use client';
import WorkloadReportBuilder from './WorkloadReportBuilder';

// Reporting tab. Previously this had two modes (a fixed "Duty & support
// balance" analysis plus the report builder); those are now folded into a
// single tool — the duty and support balance charts live as presets in the
// builder's gallery (Workload & fairness group), so there is one coherent
// place to build and view every report.
export default function WorkloadAudit({ data, huddleData }) {
  return <WorkloadReportBuilder data={data} huddleData={huddleData} />;
}
