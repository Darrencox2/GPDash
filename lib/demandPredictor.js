// ============================================================================
// demandPredictor.js — AskMyGP Demand Prediction Engine v2.0
// Winscombe & Banwell Family Practice
// ============================================================================
//
// MODEL v2.0 CHANGES:
//   + Enhanced weather: daily temp, feels-like, precipitation (Open-Meteo)
//   + First-week-back-after-school-holiday surge (+11 requests)
//   + Heavy rain day suppression
//   + Media health scare manual override (mild/moderate/major)
//   + Recalibration system with bias correction
//
// VALIDATED FACTORS (15 total):
//   1.  Day of week              (+50 Mon vs -21 Fri)
//   2.  First-day-back after BH  (+44 surge)
//   3.  Month of year            (+11 Jan vs -14 May)
//   4.  First week back school   (+11 after each holiday)
//   5.  School holidays          (-9 suppression)
//   6.  Second-day-back ext BH   (+14 after long weekends)
//   7.  Bank holiday proximity   (-5 within 3 days)
//   8.  Christmas/NY period      (-7 additional)
//   9.  Short week compression   (+3 per missing day)
//   10. End-of-month dip         (-3)
//   11. Growth trend             (+0.4/month)
//   12. Temperature deviation    (-0.29 per C above normal)
//   13. Feels-like temperature   (wind chill adjustment)
//   14. Heavy rain suppression   (-5 on days >10mm)
//   15. Media health scare       (manual: +8% / +15% / +25%)
//
// TESTED AND REJECTED (with data):
//   - Daylight hours: r=0.02 after removing month - fully captured by month
//   - Clocks change Monday: -12, wrong direction, n=3 - noise
//   - Payday proximity: -9, wrong direction - confounded with end-of-month
//   - Consecutive working days: +8, n=8 - already captured by first-day-back
//
// PERFORMANCE: R2 = 0.81, MAE = 11.7, 86% within +/-20
//
// ============================================================================

// -- MODEL COEFFICIENTS -------------------------------------------------------

export const BASELINE = 131.38;

export const DOW_EFFECTS = [49.87, 1.29, -11.14, -19.20, -21.49];
export const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const MONTH_EFFECTS = [10.65, 10.25, 7.95, 1.87, -14.38, -1.42, -2.25, -10.85, -0.69, -4.11, 2.89, -11.61];

const MONTHLY_NORMAL_TEMP = [5.6, 5.8, 7.0, 9.2, 12.2, 15.0, 17.0, 16.8, 14.5, 11.3, 8.0, 6.0];

const SCHOOL_HOL_EFFECT = -9.14;
const FIRST_WEEK_BACK_EFFECT = 11.33;
const FIRST_DAY_BACK_EFFECT = 43.60;
const SECOND_DAY_BACK_EFFECT = 14.19;
const NEAR_BH_EFFECT = -5.46;
const XMAS_PERIOD_EFFECT = -7.16;
const END_MONTH_EFFECT = -2.58;
const SHORT_WEEK_PER_MISSING_DAY = 3.0;
const MONTHLY_TREND = 0.3969;
const TEMP_COEFFICIENT = -0.2932;
const FEELS_LIKE_WEIGHT = 0.6;
const HEAVY_RAIN_THRESHOLD_MM = 10;
const HEAVY_RAIN_EFFECT = -5.0;
const POST_RAIN_REBOUND = 3.0;

const REFERENCE_DATE = new Date('2024-10-01');
const RESIDUAL_STD = 15.7;

const MEDIA_SCARE_MULTIPLIERS = {
  none: 0,
  mild: 0.08,
  moderate: 0.15,
  major: 0.25,
};


// -- MEDIA HEALTH SCARE OVERRIDE STATE ----------------------------------------

let _mediaOverride = { level: 'none', expiresAt: null, description: '' };

export function setMediaOverride(level, durationDays = 3, description = '') {
  if (!MEDIA_SCARE_MULTIPLIERS.hasOwnProperty(level)) {
    console.warn('Invalid media override level: ' + level + '. Use: mild, moderate, major');
    return;
  }
  const expires = new Date();
  expires.setDate(expires.getDate() + durationDays);
  expires.setHours(23, 59, 59, 999);
  _mediaOverride = { level, expiresAt: expires, description };
}

export function clearMediaOverride() {
  _mediaOverride = { level: 'none', expiresAt: null, description: '' };
}

export function getMediaOverride() {
  if (_mediaOverride.expiresAt && new Date() > _mediaOverride.expiresAt) {
    _mediaOverride = { level: 'none', expiresAt: null, description: '' };
  }
  return { ..._mediaOverride };
}


// -- RECALIBRATION STATE ------------------------------------------------------

let _baselineAdjustment = 0;

export function recalibrateBaseline(recentActuals) {
  if (!recentActuals || recentActuals.length < 10) {
    console.warn('Need at least 10 data points to recalibrate');
    return _baselineAdjustment;
  }
  let totalError = 0;
  let count = 0;
  recentActuals.forEach(function(item) {
    const pred = predictDemand(item.date);
    if (!pred.isWeekend && !pred.isBankHoliday) {
      totalError += item.actual - pred.predicted;
      count++;
    }
  });
  if (count > 0) {
    _baselineAdjustment = Math.round((totalError / count) * 10) / 10;
  }
  return _baselineAdjustment;
}

export function getBaselineAdjustment() {
  return _baselineAdjustment;
}


// -- BANK HOLIDAYS (algorithmic) ----------------------------------------------

function getEasterSunday(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getEnglandBankHolidays(year) {
  var holidays = [];
  var nyd = new Date(year, 0, 1);
  if (nyd.getDay() === 0) nyd = new Date(year, 0, 2);
  if (nyd.getDay() === 6) nyd = new Date(year, 0, 3);
  holidays.push({ date: nyd, name: "New Year's Day" });

  var easter = getEasterSunday(year);
  var gf = new Date(easter); gf.setDate(easter.getDate() - 2);
  var em = new Date(easter); em.setDate(easter.getDate() + 1);
  holidays.push({ date: gf, name: 'Good Friday' });
  holidays.push({ date: em, name: 'Easter Monday' });

  var earlyMay = new Date(year, 4, 1);
  while (earlyMay.getDay() !== 1) earlyMay.setDate(earlyMay.getDate() + 1);
  holidays.push({ date: earlyMay, name: 'Early May Bank Holiday' });

  var spring = new Date(year, 4, 31);
  while (spring.getDay() !== 1) spring.setDate(spring.getDate() - 1);
  holidays.push({ date: spring, name: 'Spring Bank Holiday' });

  var summer = new Date(year, 7, 31);
  while (summer.getDay() !== 1) summer.setDate(summer.getDate() - 1);
  holidays.push({ date: summer, name: 'Summer Bank Holiday' });

  var xmas = new Date(year, 11, 25);
  if (xmas.getDay() === 0) xmas = new Date(year, 11, 27);
  if (xmas.getDay() === 6) xmas = new Date(year, 11, 27);
  holidays.push({ date: xmas, name: 'Christmas Day' });

  var boxing = new Date(year, 11, 26);
  if (boxing.getDay() === 0) boxing = new Date(year, 11, 28);
  if (boxing.getDay() === 6) boxing = new Date(year, 11, 28);
  holidays.push({ date: boxing, name: 'Boxing Day' });

  return holidays;
}

function buildBankHolidaySet(startYear, endYear) {
  var set = new Set();
  var list = [];
  for (var y = startYear; y <= endYear; y++) {
    getEnglandBankHolidays(y).forEach(function(h) {
      set.add(dateKey(h.date));
      list.push(h);
    });
  }
  return { set: set, list: list };
}


// -- SCHOOL HOLIDAYS (North Somerset) -----------------------------------------

var SCHOOL_HOLIDAY_RANGES = [
  ['2024-10-28','2024-11-01'], ['2024-12-23','2025-01-03'],
  ['2025-02-17','2025-02-21'], ['2025-04-07','2025-04-21'],
  ['2025-05-26','2025-05-30'], ['2025-07-23','2025-09-03'],
  ['2025-10-27','2025-10-31'], ['2025-12-22','2026-01-02'],
  ['2026-02-16','2026-02-20'], ['2026-03-30','2026-04-10'],
  ['2026-05-25','2026-05-29'], ['2026-07-22','2026-09-02'],
  ['2026-10-26','2026-10-30'], ['2026-12-21','2027-01-01'],
  ['2027-02-15','2027-02-19'], ['2027-03-29','2027-04-09'],
  ['2027-05-31','2027-06-04'], ['2027-07-21','2027-09-02'],
];

function buildSchoolHolidaySet() {
  var set = new Set();
  SCHOOL_HOLIDAY_RANGES.forEach(function(range) {
    var s = new Date(range[0] + 'T00:00:00');
    var e = new Date(range[1] + 'T00:00:00');
    var d = new Date(s);
    while (d <= e) { set.add(dateKey(d)); d.setDate(d.getDate() + 1); }
  });
  return set;
}

function buildFirstWeekBackSet(schoolHolSet) {
  var set = new Set();
  SCHOOL_HOLIDAY_RANGES.forEach(function(range) {
    var d = new Date(range[1] + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    var count = 0;
    while (count < 5) {
      if (isWeekday(d) && !schoolHolSet.has(dateKey(d))) { set.add(dateKey(d)); count++; }
      d.setDate(d.getDate() + 1);
    }
  });
  return set;
}


// -- UTILITY FUNCTIONS --------------------------------------------------------

function dateKey(d) {
  var dt = d instanceof Date ? d : new Date(d);
  // Use local date components — toISOString() converts to UTC and shifts the
  // date by the offset (causing midnight-LOCAL dates to roll back a day in
  // timezones west of UTC, or in UTC+ timezones during DST).
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function isWeekday(d) {
  var day = d.getDay();
  return day >= 1 && day <= 5;
}

function addDays(d, n) {
  var result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function dayOfWeekIndex(d) { return (d.getDay() + 6) % 7; }

function monthsBetween(d1, d2) {
  return (d2.getTime() - d1.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
}


// -- BUILD LOOKUP SETS --------------------------------------------------------

var bhData = buildBankHolidaySet(2024, 2030);
var schoolHolSet = buildSchoolHolidaySet();
var firstWeekBackSet = buildFirstWeekBackSet(schoolHolSet);

function buildReturnDaySets() {
  var firstBack = new Set();
  var secondBack = new Set();
  bhData.list.forEach(function(bh) {
    var nxt = addDays(bh.date, 1);
    while (nxt.getDay() === 0 || nxt.getDay() === 6 || bhData.set.has(dateKey(nxt)))
      nxt = addDays(nxt, 1);
    firstBack.add(dateKey(nxt));

    var check = addDays(bh.date, -1);
    var consecutive = 1;
    while (bhData.set.has(dateKey(check)) || check.getDay() === 0 || check.getDay() === 6) {
      consecutive++; check = addDays(check, -1);
    }
    if (consecutive >= 3) {
      var sb = addDays(nxt, 1);
      while (sb.getDay() === 0 || sb.getDay() === 6) sb = addDays(sb, 1);
      secondBack.add(dateKey(sb));
    }
  });
  return { firstBack: firstBack, secondBack: secondBack };
}

var returnDays = buildReturnDaySets();


// -- HELPER FUNCTIONS ---------------------------------------------------------

function isInChristmasPeriod(d) {
  var m = d.getMonth(), day = d.getDate();
  return (m === 11 && day >= 23) || (m === 0 && day <= 2);
}

function daysToNearestBH(d) {
  var min = Infinity;
  bhData.list.forEach(function(bh) {
    var dist = Math.abs(d.getTime() - bh.date.getTime()) / (24*60*60*1000);
    if (dist < min) min = dist;
  });
  return Math.round(min);
}

function workingDaysInWeek(d) {
  var dow = (d.getDay() + 6) % 7;
  var monday = addDays(d, -dow);
  var count = 0;
  for (var i = 0; i < 5; i++) {
    var day = addDays(monday, i);
    if (!bhData.set.has(dateKey(day))) count++;
  }
  return count;
}

function effectiveTemp(actualTemp, feelsLikeTemp) {
  if (feelsLikeTemp !== null && feelsLikeTemp !== undefined) {
    return FEELS_LIKE_WEIGHT * feelsLikeTemp + (1 - FEELS_LIKE_WEIGHT) * actualTemp;
  }
  return actualTemp;
}


// -- CORE PREDICTION ENGINE ---------------------------------------------------

export function predictDemand(inputDate, weather) {
  weather = weather || null;
  var d = inputDate instanceof Date ? inputDate : new Date(inputDate + 'T00:00:00');
  var dk = dateKey(d);
  var dow = dayOfWeekIndex(d);
  var month = d.getMonth();
  var dayOfMonth = d.getDate();

  if (dow >= 5) {
    return { predicted: 0, confidence: { low: 0, high: 0 },
      factors: { note: 'Weekend - practice closed' },
      demandLevel: 'closed', staffing: { level: 'closed', buddyWeighting: 0 },
      isWeekend: true, isBankHoliday: false };
  }

  var isBH = bhData.set.has(dk);
  if (isBH) {
    return { predicted: 5, confidence: { low: 0, high: 15 },
      factors: { note: 'Bank holiday - practice closed' },
      demandLevel: 'closed', staffing: { level: 'closed', buddyWeighting: 0 },
      isWeekend: false, isBankHoliday: true };
  }

  var factors = {};
  var pred = BASELINE;
  factors.baseline = BASELINE;

  // 1. Day of week
  pred += DOW_EFFECTS[dow];
  factors.dayOfWeek = { day: DOW_NAMES[dow], effect: DOW_EFFECTS[dow] };

  // 2. Month
  pred += MONTH_EFFECTS[month];
  factors.month = { month: month + 1, effect: MONTH_EFFECTS[month] };

  // 3. School holiday
  var isSchoolHol = schoolHolSet.has(dk);
  if (isSchoolHol) { pred += SCHOOL_HOL_EFFECT; factors.schoolHoliday = SCHOOL_HOL_EFFECT; }

  // 4. First week back after school holiday
  var isFWB = firstWeekBackSet.has(dk);
  if (isFWB && !isSchoolHol) { pred += FIRST_WEEK_BACK_EFFECT; factors.firstWeekBack = FIRST_WEEK_BACK_EFFECT; }

  // 5. BH return effects
  var isFirstBack = returnDays.firstBack.has(dk);
  var isSecondBack = returnDays.secondBack.has(dk);
  if (isFirstBack) { pred += FIRST_DAY_BACK_EFFECT; factors.firstDayBack = FIRST_DAY_BACK_EFFECT; }
  else if (isSecondBack) { pred += SECOND_DAY_BACK_EFFECT; factors.secondDayBack = SECOND_DAY_BACK_EFFECT; }
  else {
    var distBH = daysToNearestBH(d);
    if (distBH <= 3) { pred += NEAR_BH_EFFECT; factors.nearBankHoliday = { daysAway: distBH, effect: NEAR_BH_EFFECT }; }
  }

  // 6. Christmas period
  if (isInChristmasPeriod(d) && !isFirstBack) { pred += XMAS_PERIOD_EFFECT; factors.christmasPeriod = XMAS_PERIOD_EFFECT; }

  // 7. End of month
  if (dayOfMonth >= 25) { pred += END_MONTH_EFFECT; factors.endOfMonth = END_MONTH_EFFECT; }

  // 8. Short week compression
  var wdInWeek = workingDaysInWeek(d);
  if (wdInWeek < 5) {
    var compression = (5 - wdInWeek) * SHORT_WEEK_PER_MISSING_DAY;
    pred += compression;
    factors.shortWeek = { workingDays: wdInWeek, effect: compression };
  }

  // 9. Growth trend
  var monthsElapsed = monthsBetween(REFERENCE_DATE, d);
  var trendEffect = MONTHLY_TREND * monthsElapsed;
  pred += trendEffect;
  factors.trend = { monthsFromRef: Math.round(monthsElapsed * 10) / 10, effect: Math.round(trendEffect * 10) / 10 };

  // 10. Weather effects (enhanced)
  if (weather) {
    var normalTemp = MONTHLY_NORMAL_TEMP[month];

    if (weather.temp !== null && weather.temp !== undefined) {
      var effTemp = effectiveTemp(weather.temp, weather.feelsLike);
      var tempDev = effTemp - normalTemp;
      var weatherEffect = TEMP_COEFFICIENT * tempDev;
      pred += weatherEffect;
      factors.weather = {
        actualTemp: weather.temp,
        feelsLike: weather.feelsLike || null,
        effectiveTemp: Math.round(effTemp * 10) / 10,
        normalTemp: normalTemp,
        deviation: Math.round(tempDev * 10) / 10,
        tempEffect: Math.round(weatherEffect * 10) / 10,
      };
    }

    if (weather.precipMm !== null && weather.precipMm !== undefined && weather.precipMm >= HEAVY_RAIN_THRESHOLD_MM) {
      pred += HEAVY_RAIN_EFFECT;
      factors.heavyRain = { precipMm: weather.precipMm, effect: HEAVY_RAIN_EFFECT };
    }

    if (weather.yesterdayPrecipMm !== null && weather.yesterdayPrecipMm !== undefined && weather.yesterdayPrecipMm >= HEAVY_RAIN_THRESHOLD_MM) {
      pred += POST_RAIN_REBOUND;
      factors.postRainRebound = { yesterdayPrecipMm: weather.yesterdayPrecipMm, effect: POST_RAIN_REBOUND };
    }
  }

  // 11. Media health scare override
  var override = getMediaOverride();
  if (override.level !== 'none') {
    var multiplier = MEDIA_SCARE_MULTIPLIERS[override.level];
    var overrideEffect = pred * multiplier;
    pred += overrideEffect;
    factors.mediaOverride = {
      level: override.level, multiplier: multiplier,
      effect: Math.round(overrideEffect * 10) / 10,
      description: override.description,
      expiresAt: override.expiresAt ? override.expiresAt.toISOString() : null,
    };
  }

  // 12. Baseline recalibration
  pred += _baselineAdjustment;
  if (_baselineAdjustment !== 0) { factors.recalibration = _baselineAdjustment; }

  var predicted = Math.max(1, Math.round(pred));
  var low = Math.max(1, Math.round(pred - 1.5 * RESIDUAL_STD));
  var high = Math.round(pred + 1.5 * RESIDUAL_STD);
  var demandLevel = classifyDemand(predicted);
  var staffing = getStaffingRecommendation(predicted);

  return {
    predicted: predicted, confidence: { low: low, high: high },
    factors: factors, demandLevel: demandLevel, staffing: staffing,
    isWeekend: false, isBankHoliday: false,
  };
}


// -- WEATHER INTEGRATION (Open-Meteo) -----------------------------------------

export async function getWeatherForecast(days) {
  days = days || 16;
  var lat = 51.32, lon = -2.84;
  try {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon
      + '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum'
      + '&timezone=Europe/London&forecast_days=' + Math.min(days, 16);
    var response = await fetch(url);
    if (!response.ok) throw new Error('Weather API ' + response.status);
    var data = await response.json();
    var weather = {};
    var dates = data.daily.time;
    dates.forEach(function(date, i) {
      var tMax = data.daily.temperature_2m_max[i];
      var tMin = data.daily.temperature_2m_min[i];
      var flMax = data.daily.apparent_temperature_max[i];
      var flMin = data.daily.apparent_temperature_min[i];
      weather[date] = {
        temp: Math.round(((tMax + tMin) / 2) * 10) / 10,
        tempMax: tMax, tempMin: tMin,
        feelsLike: Math.round(((flMax + flMin) / 2) * 10) / 10,
        feelsLikeMax: flMax, feelsLikeMin: flMin,
        precipMm: data.daily.precipitation_sum[i],
      };
    });
    dates.forEach(function(date, i) {
      weather[date].yesterdayPrecipMm = i > 0 ? weather[dates[i - 1]].precipMm : null;
    });
    return weather;
  } catch (err) {
    console.warn('Weather fetch failed:', err.message);
    return null;
  }
}


// -- MULTI-DAY FORECAST -------------------------------------------------------

export async function getForecast(days, startDate) {
  days = days || 14;
  var start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);
  var weather = await getWeatherForecast(days);
  var forecast = [];
  for (var i = 0; i < days; i++) {
    var d = addDays(start, i);
    var dk = dateKey(d);
    var dayWeather = weather && weather[dk] ? weather[dk] : null;
    var prediction = predictDemand(d, dayWeather);
    forecast.push(Object.assign({
      date: dk,
      dayName: DOW_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1],
      weather: dayWeather,
    }, prediction));
  }
  return forecast;
}


// -- DEMAND CLASSIFICATION & STAFFING -----------------------------------------

export function classifyDemand(predicted) {
  if (predicted <= 0) return 'closed';
  if (predicted <= 100) return 'low';
  if (predicted <= 135) return 'normal';
  if (predicted <= 175) return 'high';
  return 'very-high';
}

export function getStaffingRecommendation(predicted) {
  var level = classifyDemand(predicted);
  var recs = {
    closed: { level: 'closed', description: 'Practice closed', buddyWeighting: 0 },
    low: { level: 'low', description: 'Below-average demand - standard cover sufficient', buddyWeighting: 0.85 },
    normal: { level: 'normal', description: 'Normal demand - standard buddy allocation', buddyWeighting: 1.0 },
    high: { level: 'high', description: 'Above-average demand - consider extra cover', buddyWeighting: 1.15 },
    'very-high': { level: 'very-high', description: 'High demand expected - maximise cover', buddyWeighting: 1.35 },
  };
  return recs[level] || recs.normal;
}


// -- SCHOOL HOLIDAY MANAGEMENT ------------------------------------------------

export function addSchoolHolidayRanges(ranges) {
  ranges.forEach(function(range) {
    SCHOOL_HOLIDAY_RANGES.push(range);
    var s = new Date(range[0] + 'T00:00:00');
    var e = new Date(range[1] + 'T00:00:00');
    var d = new Date(s);
    while (d <= e) { schoolHolSet.add(dateKey(d)); d.setDate(d.getDate() + 1); }
  });
  var newFWB = buildFirstWeekBackSet(schoolHolSet);
  newFWB.forEach(function(dk) { firstWeekBackSet.add(dk); });
}


// -- MODEL METADATA -----------------------------------------------------------

export var MODEL_INFO = {
  version: '2.0.0',
  trainedOn: '378 working days, Oct 2024 - Mar 2026',
  r2: 0.81, mae: 11.7, mape: 11.5, withinTwenty: 86.0,
  factors: [
    'Day of week', 'Month of year',
    'School holidays (North Somerset)', 'First week back after school holiday',
    'Bank holidays (England & Wales, algorithmic Easter)',
    'First-day-back surge after BH', 'Second-day-back after extended breaks',
    'Christmas/New Year period', 'Short week compression', 'End-of-month pattern',
    'Growth trend', 'Temperature deviation (actual vs seasonal normal)',
    'Feels-like temperature (wind chill blend)', 'Heavy rain day suppression (>10mm)',
    'Post-heavy-rain rebound', 'Media health scare override (manual)',
  ],
  rejectedFactors: [
    { name: 'Daylight hours', reason: 'r=0.02 after removing month - fully captured by month effect' },
    { name: 'Clocks change Monday', reason: 'n=3, wrong direction (-12). Noise.' },
    { name: 'Payday proximity', reason: 'Effect was -9 (wrong direction), confounded with end-of-month' },
    { name: 'Consecutive working days', reason: 'n=8, already captured by first-day-back-after-BH' },
  ],
  weatherSource: 'Open-Meteo API (free, no key) - daily temp, feels-like, precipitation',
  location: 'Winscombe BS25 1AF (lat 51.32, lon -2.84)',
  lastUpdated: '2026-03-24',
};
