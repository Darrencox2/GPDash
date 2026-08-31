// Unit tests for lib/nhs-ods.js — the NHS ODS fallback that keeps practice
// lookup alive while OpenPrescribing sits behind a Cloudflare 403.
//
// The stakes: if the role filter or the nested-field extraction is wrong, a
// practice search silently returns schools and care homes, or a real practice
// looks like it does not exist and sign-up dead-ends on "Enter manually".
//
// fetch is stubbed throughout — these must not touch the live NHS API.
import { test, expect } from '@playwright/test';
import { searchPracticesByName, getPracticeByOdsCode, looksLikeOdsCode } from '../../lib/nhs-ods.js';

const realFetch = globalThis.fetch;
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push(String(url)); return handler(String(url), opts); };
  return calls;
}
function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
test.afterEach(() => { globalThis.fetch = realFetch; });

test.describe('looksLikeOdsCode', () => {
  test('accepts 5 and 6 character practice codes', () => {
    expect(looksLikeOdsCode('L81021')).toBe(true);
    expect(looksLikeOdsCode('11TAL')).toBe(true);
    expect(looksLikeOdsCode(' l81021 ')).toBe(true);
  });
  test('rejects names and wrong lengths', () => {
    expect(looksLikeOdsCode('winscombe')).toBe(false);
    expect(looksLikeOdsCode('L810')).toBe(false);
    expect(looksLikeOdsCode('L8102199')).toBe(false);
    expect(looksLikeOdsCode('')).toBe(false);
    expect(looksLikeOdsCode(undefined)).toBe(false);
  });
});

test.describe('searchPracticesByName', () => {
  test('filters to the prescribing-cost-centre role and active status', async () => {
    const calls = stubFetch(() => jsonRes({ Organisations: [] }));
    await searchPracticesByName('winscombe');
    // RO177 is the load-bearing detail: without it the same search returns
    // schools and care homes sharing the name.
    expect(calls[0]).toContain('PrimaryRoleId=RO177');
    expect(calls[0]).toContain('Status=Active');
    expect(calls[0]).toContain('Name=winscombe');
  });

  test('maps ODS fields onto the shared candidate shape', async () => {
    stubFetch(() => jsonRes({ Organisations: [
      { OrgId: 'L81021', Name: 'WINSCOMBE SURGERY', PostCode: 'BS25 1AF', Status: 'Active' },
    ] }));
    const { practices } = await searchPracticesByName('winscombe');
    expect(practices).toEqual([
      { code: 'L81021', name: 'WINSCOMBE SURGERY', postcode: 'BS25 1AF', status: 'Active' },
    ]);
  });

  test('drops malformed rows rather than emitting nameless practices', async () => {
    stubFetch(() => jsonRes({ Organisations: [
      { OrgId: 'L81021', Name: 'REAL SURGERY' },
      { OrgId: 'NONAME' },
      { Name: 'NO CODE' },
      null,
    ] }));
    const { practices } = await searchPracticesByName('surgery');
    expect(practices.map(p => p.code)).toEqual(['L81021']);
    expect(practices[0].postcode).toBe(null);
  });

  test('honours the limit so one generic word cannot flood the picker', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ OrgId: `L${i}`, Name: `PRACTICE ${i}` }));
    const calls = stubFetch(() => jsonRes({ Organisations: many }));
    const { practices } = await searchPracticesByName('health centre', { limit: 10 });
    expect(calls[0]).toContain('Limit=10');
    expect(practices).toHaveLength(10);
  });

  test('short queries never reach the network', async () => {
    const calls = stubFetch(() => jsonRes({ Organisations: [] }));
    const res = await searchPracticesByName('w');
    expect(res).toEqual({ practices: [], error: 'query_too_short' });
    expect(calls).toHaveLength(0);
  });

  test('an upstream error returns empty with a reason, never throws', async () => {
    stubFetch(() => jsonRes({}, 503));
    expect(await searchPracticesByName('winscombe')).toMatchObject({ practices: [], error: 'ods_503' });
  });

  test('a network failure returns empty with a reason, never throws', async () => {
    stubFetch(() => { throw new Error('socket hang up'); });
    expect(await searchPracticesByName('winscombe')).toMatchObject({ practices: [], error: 'socket hang up' });
  });
});

test.describe('getPracticeByOdsCode', () => {
  const gpOrg = {
    Organisation: {
      Name: 'WINSCOMBE SURGERY',
      Status: 'Active',
      OrgId: { extension: 'L81021' },
      GeoLoc: { Location: { AddrLn1: 'HILLYFIELDS WAY', Town: 'WINSCOMBE', County: 'AVON', PostCode: 'BS25 1AF', Country: 'ENGLAND' } },
      Roles: { Role: [{ id: 'RO177', primaryRole: true }, { id: 'RO76' }] },
    },
  };

  test('reads the code and postcode out of their nested detail-endpoint homes', async () => {
    stubFetch(() => jsonRes(gpOrg));
    const { practice } = await getPracticeByOdsCode('L81021');
    expect(practice).toMatchObject({
      code: 'L81021', name: 'WINSCOMBE SURGERY', postcode: 'BS25 1AF',
      addressLine1: 'HILLYFIELDS WAY', town: 'WINSCOMBE', country: 'ENGLAND',
    });
  });

  test('uppercases the code so a typed lowercase code still matches', async () => {
    const calls = stubFetch(() => jsonRes(gpOrg));
    await getPracticeByOdsCode('l81021');
    expect(calls[0]).toContain('/organisations/L81021');
  });

  test('a single non-array Role is still recognised as a practice', async () => {
    stubFetch(() => jsonRes({ Organisation: { ...gpOrg.Organisation, Roles: { Role: { id: 'RO177' } } } }));
    const { practice } = await getPracticeByOdsCode('L81021');
    expect(practice?.code).toBe('L81021');
  });

  test('rejects an organisation that is not a GP practice', async () => {
    stubFetch(() => jsonRes({ Organisation: {
      Name: 'WINSCOMBE PRIMARY SCHOOL', OrgId: { extension: 'EE148785' },
      Roles: { Role: [{ id: 'RO221' }] },
    } }));
    expect(await getPracticeByOdsCode('EE148785')).toMatchObject({ practice: null, error: 'not_a_gp_practice' });
  });

  test('an unknown code is not_found, not a crash', async () => {
    stubFetch(() => jsonRes({ errorCode: 404 }, 404));
    expect(await getPracticeByOdsCode('ZZZZZ')).toMatchObject({ practice: null, error: 'not_found' });
  });

  test('a malformed code never reaches the network', async () => {
    const calls = stubFetch(() => jsonRes(gpOrg));
    expect(await getPracticeByOdsCode('no spaces!')).toEqual({ practice: null, error: 'invalid_ods' });
    expect(calls).toHaveLength(0);
  });

  test('a network failure returns null with a reason, never throws', async () => {
    stubFetch(() => { throw new Error('timeout'); });
    expect(await getPracticeByOdsCode('L81021')).toMatchObject({ practice: null, error: 'timeout' });
  });
});
