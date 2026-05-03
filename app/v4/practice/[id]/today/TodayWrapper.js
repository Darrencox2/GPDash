'use client';
import { useState } from 'react';
import HuddleToday from '@/components/huddle/HuddleToday';
import V4ReadOnlyWrapper from '../../../_lib/V4ReadOnlyWrapper';

export default function TodayWrapper({ data: initialData, huddleData: initialHuddle }) {
  const [huddleData, setHuddleData] = useState(initialHuddle);
  const [huddleMessages, setHuddleMessages] = useState([]);
  return (
    <V4ReadOnlyWrapper data={initialData}>
      {(data, saveData) => (
        <HuddleToday
          data={data}
          saveData={saveData}
          toast={() => {}}
          huddleData={huddleData}
          setHuddleData={setHuddleData}
          huddleMessages={huddleMessages}
          setHuddleMessages={setHuddleMessages}
          setActiveSection={() => {}}
        />
      )}
    </V4ReadOnlyWrapper>
  );
}
