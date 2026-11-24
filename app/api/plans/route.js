import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';

const MOBILE_PLANS_BY_OPERATOR = {
  JIO: [
    { id: 'jio-299', amount: 299, category: 'Popular', validity: '28 Days', data: '1.5 GB/day', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'JioTV, JioCinema & JioCloud included.' },
    { id: 'jio-349', amount: 349, category: 'Unlimited 5G', validity: '28 Days', data: '2 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Hero 5G Plan · Unlimited True 5G data + JioTV & JioCloud.' },
    { id: 'jio-249', amount: 249, category: 'Popular', validity: '28 Days', data: '1 GB/day', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Daily value pack with JioTV & JioCloud.' },
    { id: 'jio-199', amount: 199, category: 'Popular', validity: '18 Days', data: '1.5 GB/day', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Short validity unlimited voice + daily high-speed data.' },
    { id: 'jio-399', amount: 399, category: 'Unlimited 5G', validity: '28 Days', data: '2.5 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'High-usage True 5G pack + JioTV, JioCinema & JioCloud.' },
    { id: 'jio-666', amount: 666, category: 'Popular', validity: '70 Days', data: '1.5 GB/day', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Long-validity daily data pack with unlimited calls.' },
    { id: 'jio-749', amount: 749, category: 'Unlimited 5G', validity: '72 Days', data: '2 GB/day + 20 GB Extra', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Unlimited True 5G + 20 GB bonus data.' },
    { id: 'jio-859', amount: 859, category: 'Unlimited 5G', validity: '84 Days', data: '2 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Most popular 84-day True 5G recharge pack.' },
    { id: 'jio-899', amount: 899, category: 'Unlimited 5G', validity: '90 Days', data: '2 GB/day + 20 GB Extra', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: '90-day True 5G plan with 200 GB total 4G + Unlimited 5G.' },
    { id: 'jio-949', amount: 949, category: 'OTT & Entertainment', validity: '84 Days', data: '2 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Includes Disney+ Hotstar Mobile (3 Months) + True 5G.' },
    { id: 'jio-1029', amount: 1029, category: 'OTT & Entertainment', validity: '84 Days', data: '2 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Includes Amazon Prime Lite (84 Days) + True 5G.' },
    { id: 'jio-1299', amount: 1299, category: 'OTT & Entertainment', validity: '84 Days', data: '2 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Includes Netflix Mobile subscription + True 5G.' },
    { id: 'jio-19', amount: 19, category: 'Data Add-on', validity: '1 Day', data: '1 GB', calls: 'Data Only', sms: 'No SMS', benefits: 'Instant 1 GB high-speed data booster.' },
    { id: 'jio-29', amount: 29, category: 'Data Add-on', validity: '2 Days', data: '2 GB', calls: 'Data Only', sms: 'No SMS', benefits: '2 GB 4G/5G add-on booster pack.' },
    { id: 'jio-69', amount: 69, category: 'Data Add-on', validity: '7 Days', data: '6 GB', calls: 'Data Only', sms: 'No SMS', benefits: '6 GB weekly data booster.' },
    { id: 'jio-139', amount: 139, category: 'Data Add-on', validity: '7 Days', data: '12 GB', calls: 'Data Only', sms: 'No SMS', benefits: '12 GB heavy data booster for work & streaming.' },
    { id: 'jio-3599', amount: 3599, category: 'Annual Plans', validity: '365 Days', data: '2.5 GB/day + True 5G', calls: 'Unlimited Voice', sms: '100 SMS/day', benefits: 'Full-year True 5G plan · 912.5 GB total 4G data.' },
    { id: 'jio-1899', amount: 1899, category: 'Annual Plans', validity: '336 Days', data: '24 GB Total', calls: 'Unlimited Voice', sms: '3600 SMS', benefits: 'Best value voice-focused long-term annual pack.' },
  ],
  AIRTEL: [
    { id: 'air-299', amount: 299, category: 'Popular', validity: '28 Days', data: '1 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Free HelloTunes + Airtel Xstream App access.' },
    { id: 'air-349', amount: 349, category: 'Unlimited 5G', validity: '28 Days', data: '1.5 GB/day + 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Truly Unlimited Calls + Free HelloTunes + Spam Alert.' },
    { id: 'air-379', amount: 379, category: 'Unlimited 5G', validity: '1 Month', data: '2 GB/day + Unlimited 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Full calendar month validity + Unlimited 5G data.' },
    { id: 'air-199', amount: 199, category: 'Popular', validity: '28 Days', data: '2 GB Total', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Best budget calling pack with 28 days validity.' },
    { id: 'air-409', amount: 409, category: 'Unlimited 5G', validity: '28 Days', data: '2.5 GB/day + Unlimited 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Includes Airtel Xstream Play (22+ OTTs) + Unlimited 5G.' },
    { id: 'air-579', amount: 579, category: 'Popular', validity: '56 Days', data: '1.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '56 days unlimited calling + daily data.' },
    { id: 'air-649', amount: 649, category: 'Unlimited 5G', validity: '56 Days', data: '2 GB/day + Unlimited 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '56 days Unlimited 5G + Apollo 24|7 Circle.' },
    { id: 'air-859', amount: 859, category: 'Popular', validity: '84 Days', data: '1.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Popular 84-day recharge + RewardsMini123.' },
    { id: 'air-979', amount: 979, category: 'OTT & Entertainment', validity: '84 Days', data: '2 GB/day + Unlimited 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Airtel Xstream Play (SonyLIV, Lionsgate, 22+ OTTs) + Unlimited 5G.' },
    { id: 'air-1199', amount: 1199, category: 'OTT & Entertainment', validity: '84 Days', data: '2.5 GB/day + Unlimited 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Includes Amazon Prime Membership (84 Days) + Xstream Play.' },
    { id: 'air-22', amount: 22, category: 'Data Add-on', validity: '1 Day', data: '1 GB', calls: 'Data Only', sms: 'No SMS', benefits: 'Quick 1-day 1 GB data voucher.' },
    { id: 'air-33', amount: 33, category: 'Data Add-on', validity: '1 Day', data: '2 GB', calls: 'Data Only', sms: 'No SMS', benefits: '2 GB instant data add-on pack.' },
    { id: 'air-77', amount: 77, category: 'Data Add-on', validity: 'Active Plan', data: '5 GB', calls: 'Data Only', sms: 'No SMS', benefits: '5 GB data booster valid till current base plan expiry.' },
    { id: 'air-1999', amount: 1999, category: 'Annual Plans', validity: '365 Days', data: '24 GB Total', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Best 365-day voice & secondary SIM value pack.' },
    { id: 'air-3599', amount: 3599, category: 'Annual Plans', validity: '365 Days', data: '2 GB/day + Unlimited 5G', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Full-year Unlimited 5G + Free HelloTunes + Spam Protection.' },
  ],
  VI: [
    { id: 'vi-299', amount: 299, category: 'Popular', validity: '28 Days', data: '1 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Vi Movies & TV Classic access included.' },
    { id: 'vi-349', amount: 349, category: 'Hero Unlimited', validity: '28 Days', data: '1.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Binge All Night (12am–6am) + Weekend Data Rollover.' },
    { id: 'vi-379', amount: 379, category: 'Hero Unlimited', validity: '1 Month', data: '2 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Full month validity + Half-Day Unlimited Data + Data Delights.' },
    { id: 'vi-199', amount: 199, category: 'Popular', validity: '28 Days', data: '2 GB Total', calls: 'Unlimited Calls', sms: '300 SMS', benefits: 'Affordable 28-day calling & validity pack.' },
    { id: 'vi-579', amount: 579, category: 'Hero Unlimited', validity: '56 Days', data: '1.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Binge All Night + Weekend Data Rollover + 2 GB Backup Data.' },
    { id: 'vi-859', amount: 859, category: 'Hero Unlimited', validity: '84 Days', data: '1.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '84-day Hero Unlimited pack with Night Free Data.' },
    { id: 'vi-979', amount: 979, category: 'OTT & Entertainment', validity: '84 Days', data: '2 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Vi Movies & TV Super (16 OTTs including SonyLIV & ZEE5).' },
    { id: 'vi-469', amount: 469, category: 'OTT & Entertainment', validity: '28 Days', data: '2.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Includes Disney+ Hotstar Mobile (3 Months) + Hero Benefits.' },
    { id: 'vi-26', amount: 26, category: 'Data Add-on', validity: '1 Day', data: '1.5 GB', calls: 'Data Only', sms: 'No SMS', benefits: 'Instant 1.5 GB 1-day data booster.' },
    { id: 'vi-49', amount: 49, category: 'Data Add-on', validity: '1 Day', data: '6 GB', calls: 'Data Only', sms: 'No SMS', benefits: '6 GB heavy 1-day data voucher.' },
    { id: 'vi-1999', amount: 1999, category: 'Annual Plans', validity: '365 Days', data: '24 GB Total', calls: 'Unlimited Calls', sms: '3600 SMS', benefits: 'Full-year validity & unlimited voice pack.' },
    { id: 'vi-3499', amount: 3499, category: 'Annual Plans', validity: '365 Days', data: '1.5 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '365-day Hero Unlimited + Weekend Data Rollover.' },
  ],
  BSNL: [
    { id: 'bsnl-107', amount: 107, category: 'Popular', validity: '35 Days', data: '3 GB Total', calls: '200 Mins Free', sms: 'Standard', benefits: 'Best budget SIM validity extension pack (35 days).' },
    { id: 'bsnl-153', amount: 153, category: 'Popular', validity: '26 Days', data: '1 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Most economical unlimited voice + daily data pack.' },
    { id: 'bsnl-199', amount: 199, category: 'Popular', validity: '30 Days', data: '2 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Full 30-day high-value unlimited calling & 2 GB/day data.' },
    { id: 'bsnl-249', amount: 249, category: 'Popular', validity: '45 Days', data: '2 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '45 days validity + 90 GB total data.' },
    { id: 'bsnl-347', amount: 347, category: 'Unlimited', validity: '54 Days', data: '2 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '54 days unlimited calls + 2 GB/day high-speed data.' },
    { id: 'bsnl-599', amount: 599, category: 'Unlimited', validity: '84 Days', data: '3 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: 'Heavy user pack: 3 GB/day for 84 days + Hardy Games.' },
    { id: 'bsnl-797', amount: 797, category: 'Annual Plans', validity: '300 Days', data: '2 GB/day (60d)', calls: 'Unlimited (60d)', sms: '100/day (60d)', benefits: '300-day long validity SIM keeper plan.' },
    { id: 'bsnl-1999', amount: 1999, category: 'Annual Plans', validity: '365 Days', data: '600 GB Total', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '600 GB lump-sum data with no daily cap for 365 days.' },
    { id: 'bsnl-2399', amount: 2399, category: 'Annual Plans', validity: '395 Days', data: '2 GB/day', calls: 'Unlimited Calls', sms: '100 SMS/day', benefits: '13-month mega validity pack with daily 2 GB data.' },
    { id: 'bsnl-16', amount: 16, category: 'Data Add-on', validity: '1 Day', data: '2 GB', calls: 'Data Only', sms: 'No SMS', benefits: 'Mini 2 GB 1-day data booster.' },
    { id: 'bsnl-98', amount: 98, category: 'Data Add-on', validity: '18 Days', data: '2 GB/day', calls: 'Data Only', sms: 'No SMS', benefits: '36 GB pure data pack for 18 days.' },
  ],
};

const DTH_PLANS_BY_OPERATOR = {
  TATA_PLAY: [
    { id: 'tp-249', amount: 249, category: 'Popular Packs', validity: '1 Month', data: '195+ Channels', calls: 'SD Pack', benefits: 'Hindi & Bengali News, Entertainment, Movies & Music.' },
    { id: 'tp-299', amount: 299, category: 'Regional & Bengali', validity: '1 Month', data: '220+ Channels', calls: 'Bengali Value', benefits: 'Star Jalsha, Zee Bangla, Colors Bangla, ABP Ananda + Hindi GEC.' },
    { id: 'tp-349', amount: 349, category: 'Hindi Family', validity: '1 Month', data: '255+ Channels', calls: 'Family SD', benefits: 'Star Plus, Zee TV, Sony, Colors, Sports & Kids channels.' },
    { id: 'tp-429', amount: 429, category: 'HD Packs', validity: '1 Month', data: '265+ Ch (45 HD)', calls: 'Family HD', benefits: 'Full HD Entertainment, Star Sports HD, Bengali & Hindi HD.' },
    { id: 'tp-499', amount: 499, category: 'Sports & Kids', validity: '1 Month', data: '295+ Ch (55 HD)', calls: 'Dhamaal HD', benefits: 'All Cricket & Football Sports HD + Kids + Movies + Regional.' },
    { id: 'tp-199', amount: 199, category: 'Popular Packs', validity: '1 Month', data: '160+ Channels', calls: 'Basic Value', benefits: 'Essential FTA + popular entertainment & news pack.' },
    { id: 'tp-1799', amount: 1799, category: 'Long Term', validity: '6 Months', data: '255+ Channels', calls: 'Semi-Annual', benefits: '6-month Hindi & Regional family pack with savings.' },
    { id: 'tp-3499', amount: 3499, category: 'Long Term', validity: '12 Months', data: '265+ Ch (HD)', calls: 'Annual HD', benefits: 'Full-year Family HD recharge pack with zero monthly hassle.' },
  ],
  AIRTEL_DTH: [
    { id: 'adth-245', amount: 245, category: 'Popular Packs', validity: '1 Month', data: '190+ Channels', calls: 'Value Lite', benefits: 'Popular Hindi GEC, Movies, News & Music channels.' },
    { id: 'adth-285', amount: 285, category: 'Regional & Bengali', validity: '1 Month', data: '215+ Channels', calls: 'Bangla Value', benefits: 'All top Bengali entertainment, movies & news + Hindi basics.' },
    { id: 'adth-335', amount: 335, category: 'Hindi Family', validity: '1 Month', data: '250+ Channels', calls: 'Dabangg Pack', benefits: 'Complete Hindi family entertainment, Sports & Kids.' },
    { id: 'adth-439', amount: 439, category: 'HD Packs', validity: '1 Month', data: '270+ Ch (48 HD)', calls: 'Value HD', benefits: 'Crystal-clear HD Entertainment, Movies & Sports HD.' },
    { id: 'adth-525', amount: 525, category: 'Sports & Kids', validity: '1 Month', data: '300+ Ch (60 HD)', calls: 'Mega Sports HD', benefits: 'Star Sports HD, Sony Ten HD, Kids & Premium Movies.' },
    { id: 'adth-1699', amount: 1699, category: 'Long Term', validity: '6 Months', data: '250+ Channels', calls: '6-Month Pack', benefits: '6-month continuous family TV subscription.' },
    { id: 'adth-3299', amount: 3299, category: 'Long Term', validity: '12 Months', data: '270+ Ch (HD)', calls: 'Annual HD', benefits: '12-month HD entertainment & sports pack.' },
  ],
  DISH_TV: [
    { id: 'dtv-229', amount: 229, category: 'Popular Packs', validity: '1 Month', data: '185+ Channels', calls: 'Family Saver', benefits: 'Top Hindi entertainment, cinema & news channels.' },
    { id: 'dtv-269', amount: 269, category: 'Regional & Bengali', validity: '1 Month', data: '210+ Channels', calls: 'Bangla Joy', benefits: 'Star Jalsha, Zee Bangla, Sony Aath + Hindi GEC.' },
    { id: 'dtv-319', amount: 319, category: 'Hindi Family', validity: '1 Month', data: '245+ Channels', calls: 'Super Family', benefits: 'Full Hindi family entertainment, Kids & Sports.' },
    { id: 'dtv-415', amount: 415, category: 'HD Packs', validity: '1 Month', data: '260+ Ch (42 HD)', calls: 'Royale HD', benefits: 'HD Movies, GEC HD & Sports HD channels.' },
    { id: 'dtv-489', amount: 489, category: 'Sports & Kids', validity: '1 Month', data: '285+ Ch (52 HD)', calls: 'All-Rounder HD', benefits: 'Live Sports HD + Kids + Infotainment + Movies.' },
    { id: 'dtv-1599', amount: 1599, category: 'Long Term', validity: '6 Months', data: '245+ Channels', calls: '6-Month Saver', benefits: 'Semi-annual Super Family value recharge.' },
    { id: 'dtv-3099', amount: 3099, category: 'Long Term', validity: '12 Months', data: '260+ Ch (HD)', calls: 'Annual HD', benefits: '1-year Royale HD pack at discounted tariff.' },
  ],
  D2H: [
    { id: 'd2h-225', amount: 225, category: 'Popular Packs', validity: '1 Month', data: '180+ Channels', calls: 'Silver Combo', benefits: 'Popular Hindi entertainment, movies & news.' },
    { id: 'd2h-265', amount: 265, category: 'Regional & Bengali', validity: '1 Month', data: '205+ Channels', calls: 'Bangla Combo', benefits: 'Complete Bengali entertainment & news + Hindi essentials.' },
    { id: 'd2h-315', amount: 315, category: 'Hindi Family', validity: '1 Month', data: '240+ Channels', calls: 'Gold Combo', benefits: 'All leading Hindi GEC, Movies, Kids & Sports.' },
    { id: 'd2h-409', amount: 409, category: 'HD Packs', validity: '1 Month', data: '255+ Ch (44 HD)', calls: 'Gold HD', benefits: 'HD Cinema, HD Sports & HD GEC channels.' },
    { id: 'd2h-479', amount: 479, category: 'Sports & Kids', validity: '1 Month', data: '280+ Ch (54 HD)', calls: 'Diamond HD', benefits: 'Premium Sports HD, Kids, Discovery & Regional HD.' },
    { id: 'd2h-1550', amount: 1550, category: 'Long Term', validity: '6 Months', data: '240+ Channels', calls: '6-Month Pack', benefits: '6-month uninterrupted Gold Combo.' },
    { id: 'd2h-2999', amount: 2999, category: 'Long Term', validity: '12 Months', data: '255+ Ch (HD)', calls: 'Annual HD', benefits: '12-month Gold HD pack with savings.' },
  ],
  SUN_DIRECT: [
    { id: 'sun-219', amount: 219, category: 'Popular Packs', validity: '1 Month', data: '185+ Channels', calls: 'Value Pack', benefits: 'Popular regional, Hindi entertainment & news channels.' },
    { id: 'sun-259', amount: 259, category: 'Regional & Bengali', validity: '1 Month', data: '215+ Channels', calls: 'Regional Super', benefits: 'South & East regional cinema, serials & news.' },
    { id: 'sun-305', amount: 305, category: 'Hindi Family', validity: '1 Month', data: '240+ Channels', calls: 'Hindi Family', benefits: 'Full Hindi entertainment, movies & sports channels.' },
    { id: 'sun-389', amount: 389, category: 'HD Packs', validity: '1 Month', data: '250+ Ch (40 HD)', calls: 'Cinema HD', benefits: 'HD entertainment, HD movies & sports HD.' },
    { id: 'sun-459', amount: 459, category: 'Sports & Kids', validity: '1 Month', data: '275+ Ch (50 HD)', calls: 'Mega Sports HD', benefits: 'Complete live cricket & football sports HD + Kids.' },
    { id: 'sun-1499', amount: 1499, category: 'Long Term', validity: '6 Months', data: '240+ Channels', calls: '6-Month Value', benefits: 'Semi-annual family pack.' },
    { id: 'sun-2899', amount: 2899, category: 'Long Term', validity: '12 Months', data: '250+ Ch (HD)', calls: 'Annual HD', benefits: 'Full-year HD value pack.' },
  ],
};

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const service = String(searchParams.get('service') || 'MOBILE').toUpperCase();
  const operator = String(searchParams.get('operator') || (service === 'DTH' ? 'TATA_PLAY' : 'JIO')).toUpperCase();
  const circle = String(searchParams.get('circle') || 'All India').trim();

  // Optional live plan provider hook: if Super Admin configured a live planApiEndpoint on the active provider
  try {
    const db = await getDb();
    const provider = await db.collection('recharge_providers').findOne({
      serviceType: service === 'DTH' ? 'DTH' : 'MOBILE',
      isActive: true,
      isConfigured: true,
      mode: 'LIVE',
    });

    if (provider?.planApiEndpoint && provider?.apiKey) {
      const url = new URL(provider.planApiEndpoint);
      url.searchParams.set('operator', operator);
      if (service !== 'DTH') url.searchParams.set('circle', circle);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${provider.apiKey}`, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (res.ok) {
          const liveJson = await res.json();
          if (Array.isArray(liveJson?.plans) && liveJson.plans.length > 0) {
            const categories = [...new Set(liveJson.plans.map((p) => p.category || 'Popular'))];
            return NextResponse.json({
              ok: true,
              service,
              operator,
              circle,
              source: 'LIVE_PROVIDER',
              fetchedAt: new Date().toISOString(),
              categories,
              plans: liveJson.plans,
            });
          }
        }
      } catch {
        // Fallback to curated operator tariff catalog below
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch {
    // Ignore DB lookup fallback errors
  }

  const catalog = service === 'DTH' ? DTH_PLANS_BY_OPERATOR : MOBILE_PLANS_BY_OPERATOR;
  const fallbackKey = service === 'DTH' ? 'TATA_PLAY' : 'JIO';
  const plans = catalog[operator] || catalog[fallbackKey] || [];
  const categories = [...new Set(plans.map((p) => p.category))];

  return NextResponse.json({
    ok: true,
    service,
    operator,
    circle,
    source: 'OPERATOR_TARIFF_CATALOG',
    fetchedAt: new Date().toISOString(),
    categories,
    plans,
  });
}
