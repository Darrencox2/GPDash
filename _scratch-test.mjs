import { createClient } from '@supabase/supabase-js';
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const P='fb6eacb7-5f6e-4573-9b27-2f30633dbc36';
const TOKEN='test-token-'+Math.random().toString(36).slice(2,10);

const { data: rep } = await a.from('saved_reports').select('id,name').eq('practice_id',P).limit(1).single();

// created_by deliberately null: with no organiser recorded, no notification
// email is attempted, so this exercises the whole flow without sending mail.
const { data: sch, error } = await a.from('report_schedules').insert({
  practice_id: P, cadence:'weekly', day_of_week:2, send_hour:8, send_minute:0,
  recipients: [{ email:'darren.cox2@nhs.net', name:'Darren Cox', external:false, token: TOKEN }],
  layout: {}, active: true, next_send_at: null, created_by: null,
}).select().single();
if (error) { console.error(error); process.exit(1); }
await a.from('report_schedule_items').insert({ schedule_id: sch.id, saved_report_id: rep.id, position: 0 });

console.log('TOKEN=' + TOKEN);
console.log('SCHEDULE=' + sch.id);
console.log('report:', rep.name);
