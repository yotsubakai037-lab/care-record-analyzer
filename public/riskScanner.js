'use strict';

// ================================================================
//  riskScanner.js  ─  全利用者の危険度スコアをブラウザ上で算出
// ================================================================

window.RiskScanner = (() => {

  // ── 入院リスク キーワード（スコア降順） ──
  const HOSPITAL_KW = [
    { words: ['救急', '搬送', '入院', '緊急搬送'],                               score: 40 },
    { words: ['意識消失', 'けいれん', '痙攣', 'チアノーゼ', '呼吸困難', '胸痛'], score: 35 },
    { words: ['骨折', '脱水', '高熱'],                                            score: 25 },
    { words: ['嘔吐', '嘔気', '転倒', '転落'],                                    score: 20 },
    { words: ['受診', '通院', '診察', '発熱', '食事拒否', '拒食'],                score: 15 },
    { words: ['不穏', '興奮', '攻撃', '食欲不振', '食欲低下', '水分摂取不良'],    score: 10 },
  ];

  // ── 急変検知用 ネガティブキーワード ──
  const NEG_KW = [
    '悪化', '不調', '体調不良', '元気なし', '活気なし', '食欲不振', '食欲低下',
    '不眠', '眠れない', '発熱', '嘔吐', '下痢', '便秘', '血圧高', '血圧低',
    '転倒', '不穏', '混乱', '泣', '叫', '拒否', '怒', '痛み', '体重減',
    '脱水', 'けいれん', '痙攣', '意識',
  ];

  // ── ユーティリティ ──

  function textOf(row) {
    return [
      row.support_content, row.notes, row.vitals, row.assessment,
      row['記録内容'], row['支援内容'], row['特記事項'], row['備考'], row['評価'],
    ].filter(Boolean).join(' ');
  }

  function parseTemp(v) {
    if (!v) return null;
    const n = parseFloat(String(v).replace(/[℃度]/g, ''));
    return (isNaN(n) || n < 34 || n > 42) ? null : n;
  }

  function parseSBP(v) {
    if (!v) return null;
    const m = String(v).match(/(\d{2,3})/);
    if (!m) return null;
    const n = parseInt(m[1]);
    return (n < 60 || n > 260) ? null : n;
  }

  function parsePulse(v) {
    if (!v) return null;
    const n = parseFloat(String(v));
    return (isNaN(n) || n < 20 || n > 260) ? null : n;
  }

  function parseMeal(v) {
    if (!v) return null;
    const s = String(v);
    if (/全量|完食/.test(s)) return 100;
    if (/半分|1\/2/.test(s))  return 50;
    if (/少量|少し/.test(s))  return 20;
    if (/不食|拒食/.test(s) || s === '0') return 0;
    const m = s.match(/(\d+)/);
    if (m) { const n = parseInt(m[1]); if (n <= 100) return n; }
    return null;
  }

  function parseSleep(v) {
    if (!v) return null;
    const n = parseFloat(String(v));
    return (isNaN(n) || n < 0 || n > 24) ? null : n;
  }

  function toDate(s) {
    if (!s) return null;
    const d = new Date(String(s).slice(0, 10));
    return isNaN(d.getTime()) ? null : d;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function avg(arr) {
    return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  }

  // ── 1レコードの入院リスクスコア ──

  function scoreRecord(row) {
    let s = 0;
    const reasons = [];
    const text = textOf(row);

    for (const grp of HOSPITAL_KW) {
      for (const w of grp.words) {
        if (text.includes(w)) {
          s += grp.score;
          reasons.push(w);
          break; // 同グループは1回のみ
        }
      }
    }

    const temp = parseTemp(row.temperature || row['体温']);
    if (temp !== null) {
      if      (temp >= 38.5) { s += 30; reasons.push(`体温${temp}℃`); }
      else if (temp >= 38.0) { s += 20; reasons.push(`体温${temp}℃`); }
      else if (temp >= 37.5) { s += 10; reasons.push(`体温${temp}℃`); }
    }

    const sbp = parseSBP(row.blood_pressure || row['血圧']);
    if (sbp !== null) {
      if      (sbp >= 180 || sbp < 80) { s += 30; reasons.push(`血圧${sbp}`); }
      else if (sbp >= 160 || sbp < 90) { s += 15; reasons.push(`血圧${sbp}`); }
    }

    const pulse = parsePulse(row.pulse || row['脈拍']);
    if (pulse !== null) {
      if      (pulse >= 130 || pulse < 45) { s += 25; reasons.push(`脈拍${pulse}`); }
      else if (pulse >= 110 || pulse < 55) { s += 12; reasons.push(`脈拍${pulse}`); }
    }

    const meal = parseMeal(row.meal_amount || row['食事量']);
    if (meal !== null) {
      if      (meal <= 10) { s += 25; reasons.push(`食事量${meal}%`); }
      else if (meal <= 30) { s += 15; reasons.push(`食事量${meal}%`); }
    }

    return { score: s, reasons };
  }

  // ── ネガティブキーワード件数 ──

  function negCount(rows) {
    let n = 0;
    rows.forEach(row => {
      const text = textOf(row);
      NEG_KW.forEach(kw => { if (text.includes(kw)) n++; });
    });
    return n;
  }

  // ── 全利用者スキャン ──

  function scanAll(scRows, mmRows) {
    const d90 = daysAgo(90);
    const d14 = daysAgo(14);
    const d28 = daysAgo(28);

    const dateOf = r => r.date || r['日付'] || r['記録日'] || '';
    const userOf = r => r.user_name || r['利用者名'] || r['利用者'] || r['氏名'] || '';

    // ユーザーごとにグループ化
    const scByUser = {};
    scRows.forEach(r => {
      const u = userOf(r); if (!u) return;
      (scByUser[u] = scByUser[u] || []).push(r);
    });
    const mmByUser = {};
    mmRows.forEach(r => {
      const u = r['利用者名'] || ''; if (!u) return;
      (mmByUser[u] = mmByUser[u] || []).push(r);
    });

    const allUsers = [...new Set([...Object.keys(scByUser), ...Object.keys(mmByUser)])];

    const results = allUsers.map(user => {
      const sc = scByUser[user] || [];
      const mm = mmByUser[user] || [];

      // ──── ① 入院リスク ────
      // 直近90日（日付なし行は全件対象）
      const sc90 = sc.filter(r => {
        const d = toDate(dateOf(r));
        return d === null || d >= d90;
      });

      let maxScore    = 0;
      let totalScore  = 0;
      const reasonMap = new Map();

      sc90.forEach(row => {
        const { score, reasons } = scoreRecord(row);
        if (score > maxScore) maxScore = score;
        totalScore += score;
        reasons.forEach(r => reasonMap.set(r, (reasonMap.get(r) || 0) + 1));
      });

      // まもるーの 直近14日の平均睡眠時間が短い → 入院リスク加算
      const mm14 = mm.filter(r => { const d = toDate(r['日付']); return d === null || d >= d14; });
      const mmSleepVals = mm14.map(r => parseSleep(r['睡眠時間'])).filter(v => v !== null);
      let mmBonus = 0;
      if (mmSleepVals.length) {
        const avgSleep = avg(mmSleepVals);
        if (avgSleep < 3)      mmBonus = 20;
        else if (avgSleep < 5) mmBonus = 10;
      }

      const freqFactor = sc90.length > 0
        ? Math.min((totalScore / sc90.length) / 10 * 30, 30)
        : 0;
      const hospitalRisk = Math.min(Math.round((maxScore + mmBonus) * 0.7 + freqFactor), 100);

      // ──── ② 急変リスク（直近14日 vs 前14日比較） ────
      const scRecent = sc.filter(r => { const d = toDate(dateOf(r)); return d !== null && d >= d14; });
      const scPrior  = sc.filter(r => { const d = toDate(dateOf(r)); return d !== null && d >= d28 && d < d14; });

      let changeRisk   = 0;
      const changeReasons = [];

      if (scRecent.length > 0 && scPrior.length > 0) {
        // キーワード頻度比較
        const nrRate = negCount(scRecent) / scRecent.length;
        const npRate = negCount(scPrior)  / scPrior.length;

        if (nrRate > 0 && npRate > 0) {
          const ratio = nrRate / npRate;
          if      (ratio >= 2.5) { changeRisk += 35; changeReasons.push('要注意キーワードが急増'); }
          else if (ratio >= 1.5) { changeRisk += 20; changeReasons.push('要注意キーワードが増加'); }
        } else if (nrRate > 0 && npRate === 0) {
          changeRisk += 25;
          changeReasons.push('新たな要注意キーワードが出現');
        }

        // 体温変化
        const tR = scRecent.map(r => parseTemp(r.temperature || r['体温'])).filter(v => v !== null);
        const tP = scPrior.map( r => parseTemp(r.temperature || r['体温'])).filter(v => v !== null);
        if (tR.length && tP.length) {
          const diff = avg(tR) - avg(tP);
          if      (diff >= 0.8) { changeRisk += 25; changeReasons.push(`体温 +${diff.toFixed(1)}℃上昇傾向`); }
          else if (diff >= 0.4) { changeRisk += 12; changeReasons.push(`体温 +${diff.toFixed(1)}℃上昇傾向`); }
        }

        // 血圧変化
        const bR = scRecent.map(r => parseSBP(r.blood_pressure || r['血圧'])).filter(v => v !== null);
        const bP = scPrior.map( r => parseSBP(r.blood_pressure || r['血圧'])).filter(v => v !== null);
        if (bR.length && bP.length) {
          const diff = avg(bR) - avg(bP);
          if      (diff >= 20) { changeRisk += 20; changeReasons.push(`血圧 +${Math.round(diff)}上昇傾向`); }
          else if (diff <= -20) { changeRisk += 20; changeReasons.push(`血圧 ${Math.round(diff)}低下傾向`); }
        }

        // 記録件数激減（欠勤・体調悪化のサイン）
        if (scRecent.length < scPrior.length * 0.35 && scPrior.length >= 3) {
          changeRisk += 15;
          changeReasons.push('記録件数が大幅に減少');
        }

      } else if (scRecent.length > 0 && scPrior.length === 0) {
        // 比較データなし: 直近最新レコードのみ評価
        const last = scRecent[scRecent.length - 1];
        const { score } = scoreRecord(last);
        if (score > 0) {
          changeRisk += Math.min(Math.round(score * 0.5), 30);
          changeReasons.push('直近に要注意記録あり');
        }
      }

      // まもるーの 睡眠時間・体動の変化
      const mmRecent = mm.filter(r => { const d = toDate(r['日付']); return d !== null && d >= d14; });
      const mmPrior  = mm.filter(r => { const d = toDate(r['日付']); return d !== null && d >= d28 && d < d14; });

      if (mmRecent.length >= 2 && mmPrior.length >= 2) {
        const sR = avg(mmRecent.map(r => parseSleep(r['睡眠時間'])).filter(v => v !== null));
        const sP = avg(mmPrior.map( r => parseSleep(r['睡眠時間'])).filter(v => v !== null));
        if (sR !== null && sP !== null) {
          const diff = Math.abs(sR - sP);
          if      (diff >= 2) { changeRisk += 25; changeReasons.push(`睡眠時間が${diff.toFixed(1)}h変化`); }
          else if (diff >= 1) { changeRisk += 12; changeReasons.push(`睡眠時間が${diff.toFixed(1)}h変化`); }
        }

        const avgBody = rows => avg(rows.map(r => parseInt(r['体動回数'])).filter(v => !isNaN(v)));
        const bR = avgBody(mmRecent), bP = avgBody(mmPrior);
        if (bR !== null && bP !== null && bP > 0 && bR / bP >= 1.8) {
          changeRisk += 15;
          changeReasons.push('体動回数が急増');
        }
      }

      changeRisk = Math.min(changeRisk, 100);

      const topReasons = [...reasonMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([r]) => r);

      return {
        user,
        hospitalRisk,
        changeRisk,
        totalRisk: Math.max(hospitalRisk, changeRisk),
        hospitalReasons: topReasons,
        changeReasons: changeReasons.slice(0, 3),
        scRecordCount: sc.length,
        mmRecordCount: mm.length,
      };
    }).sort((a, b) => b.totalRisk - a.totalRisk);

    return results;
  }

  return { scanAll };

})();
