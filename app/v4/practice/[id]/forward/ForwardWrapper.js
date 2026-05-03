'use client';
import HuddleForward from '@/components/huddle/HuddleForward';
import V4ReadOnlyWrapper from '../../../_lib/V4ReadOnlyWrapper';

export default function ForwardWrapper({ data: initialData, huddleData }) {
  return (
    <V4ReadOnlyWrapper data={initialData}>
      {(data, saveData) => (
        <HuddleForward data={data} saveData={saveData} huddleData={huddleData} setActiveSection={() => {}} />
      )}
    </V4ReadOnlyWrapper>
  );
}
