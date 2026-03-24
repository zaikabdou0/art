// ══════════════════════════════════════════════════════════════
//  كشف.js — Silent Bot Scanner v9.1
//  إصلاحات: رد دائماً، مجموعة مقفلة، منشن فردي، shock probe
// ══════════════════════════════════════════════════════════════

import { jidDecode } from '@whiskeysockets/baileys';

const HARD = new Set([
    'ID_INSTANT', 'SHOCK_RECEIPT', 'DEVICE_ANOMALY',
    'PROTOCOL_ANOMALY', 'BURST_READ_FIXED', 'SESSION_FLAP',
    'IDLE_JUMP', 'BEHAVIORAL_DRIFT', 'FIRST_READER_PATTERN',
    'EXACT_LATENCY', 'PACKET_TIMING_SIGNATURE',
    'FIRST_READ_LATENCY_SIGNATURE', 'JID_BOT_FINGERPRINT',
]);
const SOFT = new Set([
    'PRESENCE_SNIPER', 'ID_SIGNATURE', 'INSTANT_RECEIPT',
    'ZERO_JITTER', 'READ_NO_PRESENCE', 'GHOST_CONNECT',
    'NO_READ_VARIANCE', 'PASSIVE_OBSERVER',
    'WINDOW_RECEIPT_PATTERN', 'FORWARDING_ANOMALY',
    'IMPOSSIBLE_READ_TIME',
]);

if (!global._KASHF_V9) {
    global._KASHF_V9 = {
        activeGroups   : new Set(),
        detected       : new Map(),
        receiptLog     : new Map(),
        sessions       : new Map(),
        shockMsgIds    : new Map(),
        lastAdminMsgTs : new Map(),
        jidScanCache   : new Map(),
        correlLog      : new Map(),
        baseline       : new Map(),
        readOrder      : new Map(),
        firstReads     : new Map(),
        lastActivity   : new Map(),
        readCount      : new Map(),
        driftRing      : new Map(),
        packetLog      : new Map(),
        presenceData   : new Map(),
        senderKeys     : new Set(),
        msgActivity    : new Map(),
    };
}
const S         = global._KASHF_V9;
const _sessions = S.sessions;
const REGISTERED = Symbol('kashfV91');

// ── Constants ────────────────────────────────────────────────
const INSTANT_BOT_IDS   = ['BAE5', '3EB0', '4EB0'];
const SOFT_BOT_IDS      = ['B24E', 'DF39'];
const BOT_ID_LENS       = [16, 20, 22];
const DEVICE_BOT_MIN    = 20;
const BAILEYS_DEVICE_RANGE = [2, 4];
const SNIPER_WINDOW_MS  = 3_000;
const SNIPER_SCORE      = 95;
const SHOCK_RECEIPT_MS  = 100;
const SHOCK_TIMEOUT_MS  = 15_000;
const SHOCK_TEXT        = '\u200B\u200C\u200D\uFEFF ';
const INSTANT_MS        = 120;
const JITTER_MAX_SD     = 35;
const EXACT_DELTA       = 10;
const READ_NO_PRES_MS   = 5_000;
const READ_NO_PRES_MIN  = 3;
const GHOST_MS          = 2_000;
const FLAP_WINDOW_MS    = 10_000;
const FLAP_THRESH       = 4;
const BURST_WIN_MS      = 4_000;
const BURST_MIN         = 3;
const BURST_JITTER_MAX  = 50;
const IDLE_GAP_MS       = 300_000;
const IDLE_BURST_WIN    = 5_000;
const IDLE_BURST_MIN    = 3;
const PASSIVE_READS_MIN = 8;
const PASSIVE_INSTANT_PCT = 0.90;
const PASSIVE_READ_MAX  = 500;
const FIRST_READER_RATIO = 0.75;
const FIRST_READER_MIN  = 6;
const FIRST_LATENCY_MS  = 150;
const FIRST_LATENCY_MIN = 5;
const FIRST_LATENCY_RATIO = 0.80;
const DRIFT_WIN_SIZE    = 10;
const DRIFT_RINGS       = 3;
const DRIFT_Z_THRESHOLD = 2.5;
const PACKET_WIN_MS     = 30_000;
const PACKET_MIN_EVENTS = 5;
const PACKET_JITTER_MAX = 40;
const PURGE_TTL_MS      = 10 * 60 * 1000;

const norm = j => j?.split('@')[0]?.split(':')[0] || '';

// ── Math ─────────────────────────────────────────────────────
function mean(arr)   { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stddev(arr) {
    if (arr.length < 2) return 9999;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length);
}
function zScore(x,m,sd) { return sd <= 0 ? 0 : Math.abs((x-m)/sd); }

// ── Flag ─────────────────────────────────────────────────────
function flag(jid, groupId, reason, score=0) {
    const key = `${jid}::${groupId}`;
    if (!S.detected.has(key))
        S.detected.set(key, { jid, groupId, hard:new Set(), soft:new Set(), ts:Date.now(), score:0 });
    const e = S.detected.get(key);
    e.ts = Date.now();
    (HARD.has(reason) ? e.hard : e.soft).add(reason);
    if (score) e.score = Math.max(e.score, score);
}

function isConfirmed(jid, groupId) {
    const e = S.detected.get(`${jid}::${groupId}`);
    if (!e) return false;
    if (e.hard.has('ID_INSTANT'))          return true;
    if (e.hard.has('SHOCK_RECEIPT'))       return true;
    if (e.hard.has('JID_BOT_FINGERPRINT')) return true;
    if (e.score >= 95)                     return true;
    if (e.hard.size >= 2)                  return true;
    if (e.hard.size >= 1 && e.soft.size >= 1) return true;
    if (e.soft.size >= 3)                  return true;
    return false;
}

// ── Auto-Purge ───────────────────────────────────────────────
function startAutoPurge() {
    if (global._KASHF_V9_PURGE) return;
    global._KASHF_V9_PURGE = true;
    setInterval(() => {
        const cut = Date.now() - PURGE_TTL_MS;
        for (const [k,v] of S.detected)  { if ((v.ts||0)<cut) S.detected.delete(k); }
        for (const [k,v] of S.receiptLog){ if (v.sentAt<cut) S.receiptLog.delete(k); }
    }, PURGE_TTL_MS).unref?.();
}

// ── JID Scan ─────────────────────────────────────────────────
async function scanJids(sock, groupId) {
    try {
        const meta = await sock.groupMetadata(groupId);
        if (!meta?.participants) return [];
        const results = [];
        for (const p of meta.participants) {
            if (p.admin) continue;
            const jid = p.id;
            let botFlag = false, reason = '';
            if (jid.includes(':')) {
                try {
                    const d = jidDecode(jid);
                    if (d?.device && d.device > DEVICE_BOT_MIN)      { botFlag=true; reason=`device:${d.device}`; }
                    if (d?.device && BAILEYS_DEVICE_RANGE.includes(d.device)) { botFlag=true; reason=`baileys:${d.device}`; }
                } catch {}
            }
            if (norm(jid).length < 10) { botFlag=true; reason=`short_jid`; }
            if (botFlag) { flag(jid, groupId, 'JID_BOT_FINGERPRINT'); results.push({ jid, reason }); }
        }
        S.jidScanCache.set(groupId, results);
        return results;
    } catch { return []; }
}

// ── Shock Probe ───────────────────────────────────────────────
// مجموعة مقفلة: البوت ليس ادمن → نبعث رسالة عادية نستغلها لـ receipts
async function sendShockProbe(sock, groupId) {
    try {
        const probeMsg = await sock.sendMessage(groupId, { text: SHOCK_TEXT });
        if (!probeMsg?.key?.id) return;
        S.receiptLog.set(probeMsg.key.id, { sentAt: Date.now(), groupId, isShock: true });
        S.shockMsgIds.set(groupId, { msgId: probeMsg.key.id, sentAt: Date.now() });
        // حذف الرسالة بعد 15 ثانية
        setTimeout(async () => {
            try { await sock.sendMessage(groupId, { delete: probeMsg.key }); } catch {}
            S.shockMsgIds.delete(groupId);
        }, SHOCK_TIMEOUT_MS);
    } catch {}
}

// ── Helpers ──────────────────────────────────────────────────
function updateBaseline(jid,gid,lat) {
    const k = `${jid}::${gid}`;
    if (!S.baseline.has(k)) S.baseline.set(k,{latencies:[],mean:0,stdev:9999,count:0});
    const b=S.baseline.get(k); b.latencies.push(lat); if(b.latencies.length>50)b.latencies.shift();
    b.count++; b.mean=mean(b.latencies); b.stdev=stddev(b.latencies);
}
function updateDrift(jid,gid,lat) {
    const k=`${jid}::${gid}`;
    if (!S.driftRing.has(k)) S.driftRing.set(k,{buf:[],windows:[]});
    const d=S.driftRing.get(k); d.buf.push(lat);
    if (d.buf.length>=DRIFT_WIN_SIZE) {
        const win={m:mean(d.buf),sd:stddev(d.buf),burst:d.buf.filter(v=>v<INSTANT_MS).length};
        d.windows.push(win); if(d.windows.length>DRIFT_RINGS)d.windows.shift(); d.buf=[];
        if (d.windows.length>=2) {
            const p=d.windows[d.windows.length-2],c=d.windows[d.windows.length-1];
            const zm=zScore(c.m,p.m,Math.max(p.sd,1)),zs=zScore(c.sd,p.sd,Math.max(p.sd*.1,1));
            const burst=p.burst<=1&&c.burst>=(DRIFT_WIN_SIZE*.6);
            if (zm>DRIFT_Z_THRESHOLD||zs>DRIFT_Z_THRESHOLD||burst) flag(jid,gid,'BEHAVIORAL_DRIFT');
        }
    }
}
function trackPacket(jid,gid) {
    const k=`${jid}::${gid}`; if(!S.packetLog.has(k))S.packetLog.set(k,[]);
    const log=S.packetLog.get(k),now=Date.now(); log.push(now);
    const cut=now-PACKET_WIN_MS; while(log.length&&log[0]<cut)log.shift();
    if (log.length<PACKET_MIN_EVENTS) return;
    const ivs=[]; for(let i=1;i<log.length;i++)ivs.push(log[i]-log[i-1]);
    if (stddev(ivs)<PACKET_JITTER_MAX) flag(jid,gid,'PACKET_TIMING_SIGNATURE');
}
function trackReadOrder(jid,gid,msgId,readTs) {
    if(!S.readOrder.has(gid))S.readOrder.set(gid,new Map());
    const gMap=S.readOrder.get(gid); if(!gMap.has(msgId))gMap.set(msgId,[]);
    const readers=gMap.get(msgId); readers.push({jid,ts:readTs});
    if(gMap.size>50)gMap.delete(gMap.keys().next().value);
    const frKey=`${jid}::${gid}`;
    if(!S.firstReads.has(frKey))S.firstReads.set(frKey,{total:0,first:0,fastFirst:0});
    const fr=S.firstReads.get(frKey); fr.total++;
    const sorted=readers.slice().sort((a,b)=>a.ts-b.ts),isFirst=sorted[0]?.jid===jid;
    if (isFirst) { fr.first++; const le=S.receiptLog.get(msgId); if(le){const lat=readTs-le.sentAt;if(lat>0&&lat<FIRST_LATENCY_MS)fr.fastFirst++;} }
    if(fr.total>=FIRST_READER_MIN&&fr.first/fr.total>=FIRST_READER_RATIO) flag(jid,gid,'FIRST_READER_PATTERN');
    if(fr.first>=FIRST_LATENCY_MIN&&fr.fastFirst/fr.first>=FIRST_LATENCY_RATIO) flag(jid,gid,'FIRST_READ_LATENCY_SIGNATURE');
}
function trackIdle(jid,gid,readTs) {
    const k=`${jid}::${gid}`;
    if(!S.lastActivity.has(k))S.lastActivity.set(k,{lastMsg:0,lastRead:0,lastCompose:0,burstStart:0,burstCount:0});
    const act=S.lastActivity.get(k),now=Date.now(),lastActive=Math.max(act.lastMsg,act.lastRead,act.lastCompose);
    if (lastActive&&(now-lastActive)>IDLE_GAP_MS) { act.burstStart=now; act.burstCount=1; }
    else if (act.burstStart&&(now-act.burstStart)<IDLE_BURST_WIN) { act.burstCount++; if(act.burstCount>=IDLE_BURST_MIN&&!act.lastCompose)flag(jid,gid,'IDLE_JUMP'); }
    else { act.burstStart=0; act.burstCount=0; }
    act.lastRead=now;
}
function trackPassive(jid,gid,lat) {
    const k=`${jid}::${gid}`; if(!S.readCount.has(k))S.readCount.set(k,{total:0,instant:0});
    const rc=S.readCount.get(k); rc.total++; if(lat>0&&lat<PASSIVE_READ_MAX)rc.instant++;
    if (rc.total>=PASSIVE_READS_MIN) { const act=S.lastActivity.get(k); if(!act?.lastMsg&&rc.instant/rc.total>=PASSIVE_INSTANT_PCT)flag(jid,gid,'PASSIVE_OBSERVER'); }
}

// ── Scanner ──────────────────────────────────────────────────
function startScanner(sock) {
    if (sock[REGISTERED]) return;
    sock[REGISTERED] = true;
    const botNum = norm(sock.user?.id || '');
    startAutoPurge();

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            try {
                if (msg.key.fromMe) continue;
                const groupId = msg.key.remoteJid;
                if (!S.activeGroups.has(groupId)) continue;
                const jid   = msg.key.participant || groupId;
                const msgId = msg.key.id || '';
                if (norm(jid) === botNum) continue;
                const now = Date.now();

                if (msgId.length >= 4) {
                    const pfx = msgId.slice(0,4).toUpperCase();
                    if (INSTANT_BOT_IDS.includes(pfx) && BOT_ID_LENS.includes(msgId.length)) flag(jid,groupId,'ID_INSTANT');
                    else if (SOFT_BOT_IDS.includes(pfx) && BOT_ID_LENS.includes(msgId.length)) flag(jid,groupId,'ID_SIGNATURE');
                }
                if (msg.message?.protocolMessage) flag(jid,groupId,'PROTOCOL_ANOMALY');
                if (msg.message?.senderKeyDistributionMessage) S.senderKeys.add(jid);
                const rawPart = msg.key.participant||'';
                if (rawPart.includes(':')) { try { const d=jidDecode(rawPart); if(d?.device&&d.device>DEVICE_BOT_MIN)flag(jid,groupId,'DEVICE_ANOMALY'); } catch {} }
                const ctx = msg.message?.extendedTextMessage?.contextInfo||msg.message?.imageMessage?.contextInfo||msg.message?.videoMessage?.contextInfo;
                if (ctx&&(ctx.forwardingScore>20||(ctx.isForwarded&&!ctx.participant))) flag(jid,groupId,'FORWARDING_ANOMALY');
                const actKey=`${jid}::${groupId}`;
                if(!S.lastActivity.has(actKey))S.lastActivity.set(actKey,{lastMsg:0,lastRead:0,lastCompose:0,burstStart:0,burstCount:0});
                S.lastActivity.get(actKey).lastMsg=now;
                trackPacket(jid,groupId);
                S.receiptLog.set(msgId,{sentAt:now,groupId,isShock:false});
                if(S.receiptLog.size>1000)S.receiptLog.delete(S.receiptLog.keys().next().value);
            } catch {}
        }
    });

    sock.ev.on('message-receipt.update', (updates) => {
        const now=Date.now(), batchByJid=new Map();
        for (const update of (updates||[])) {
            try {
                const msgId=update.key?.id, groupId=update.key?.remoteJid, jid=update.key?.participant||groupId;
                if (!msgId||!jid||!S.activeGroups.has(groupId)) continue;
                if (norm(jid)===botNum) continue;
                const logged=S.receiptLog.get(msgId);
                const rawRead=update.receipt?.readTimestamp||update.receipt?.receiptTimestamp;
                const readTs=rawRead?rawRead*1000:now;
                if (logged?.isShock) {
                    const lat=now-logged.sentAt;
                    if (lat>=0&&lat<SHOCK_RECEIPT_MS) flag(jid,groupId,'SHOCK_RECEIPT');
                    continue;
                }
                if (logged) {
                    const lat=now-logged.sentAt;
                    if (lat>0&&lat<INSTANT_MS) flag(jid,groupId,'INSTANT_RECEIPT');
                    if (lat>0&&lat<30_000) {
                        updateBaseline(jid,groupId,lat);
                        const bl=S.baseline.get(`${jid}::${groupId}`);
                        if(bl&&bl.count>=4&&bl.stdev<JITTER_MAX_SD) flag(jid,groupId,'ZERO_JITTER');
                        if(bl&&bl.latencies.length>=4){const l4=bl.latencies.slice(-4);if(Math.max(...l4)-Math.min(...l4)<EXACT_DELTA)flag(jid,groupId,'EXACT_LATENCY');}
                        updateDrift(jid,groupId,lat); trackPassive(jid,groupId,lat); trackPacket(jid,groupId);
                    }
                }
                trackReadOrder(jid,groupId,msgId,readTs); trackIdle(jid,groupId,readTs);
                const pData=S.presenceData.get(jid)||{};
                const rnpKey=`${jid}::${groupId}::rnp`, rnpCnt=S.msgActivity.get(rnpKey)||0;
                if (!pData.lastSeen||(readTs-pData.lastSeen)>READ_NO_PRES_MS) { S.msgActivity.set(rnpKey,rnpCnt+1); if(rnpCnt+1>=READ_NO_PRES_MIN)flag(jid,groupId,'READ_NO_PRESENCE'); }
                else S.msgActivity.set(rnpKey,0);
                const svKey=`${jid}::${groupId}::seen`; if(!S.msgActivity.has(svKey))S.msgActivity.set(svKey,[]);
                const sb=S.msgActivity.get(svKey); sb.push(readTs); if(sb.length>10)sb.shift();
                if (sb.length>=5){const diffs=[];for(let i=1;i<sb.length;i++)diffs.push(sb[i]-sb[i-1]);if(stddev(diffs)<30)flag(jid,groupId,'NO_READ_VARIANCE');}
                if (!batchByJid.has(jid))batchByJid.set(jid,{groupId,reads:[]});
                batchByJid.get(jid).reads.push(readTs);
                // Window receipt
                const dts=update.receipt?.deliveredTimestamp||update.receipt?.receiptTimestamp, rts=update.receipt?.readTimestamp;
                if (rts&&!dts) flag(jid,groupId,'WINDOW_RECEIPT_PATTERN');
                if (rts&&dts&&Math.abs(rts-dts)<2) flag(jid,groupId,'WINDOW_RECEIPT_PATTERN');
            } catch {}
        }
        for (const [jid,{groupId,reads}] of batchByJid) {
            try {
                if (reads.length<BURST_MIN) continue;
                reads.sort((a,b)=>a-b);
                if (reads[reads.length-1]-reads[0]>BURST_WIN_MS) continue;
                const ivs=[];for(let i=1;i<reads.length;i++)ivs.push(reads[i]-reads[i-1]);
                if (stddev(ivs)<BURST_JITTER_MAX) flag(jid,groupId,'BURST_READ_FIXED');
            } catch {}
        }
    });

    sock.ev.on('presence.update', ({ id: groupId, presences }) => {
        if (!S.activeGroups.has(groupId)) return;
        const now=Date.now();
        for (const [jid,data] of Object.entries(presences||{})) {
            if (!S.presenceData.has(jid)) S.presenceData.set(jid,{connectedAt:null,lastSeen:null,flapTimes:[],composingAt:null});
            const pData=S.presenceData.get(jid), s=data?.lastKnownPresence;
            trackPacket(jid,groupId);
            if (s==='available') {
                pData.connectedAt=now; pData.lastSeen=now;
                pData.flapTimes.push(now); pData.flapTimes=pData.flapTimes.filter(t=>now-t<FLAP_WINDOW_MS);
                if(pData.flapTimes.length>=FLAP_THRESH) flag(jid,groupId,'SESSION_FLAP');
                const lastAdmin=S.lastAdminMsgTs.get(groupId)||0;
                if(now-lastAdmin<SNIPER_WINDOW_MS) flag(jid,groupId,'PRESENCE_SNIPER',SNIPER_SCORE);
            } else if (s==='composing'||s==='recording') {
                pData.composingAt=now; pData.lastSeen=now; pData.connectedAt=null;
                const actKey=`${jid}::${groupId}`; if(S.lastActivity.has(actKey))S.lastActivity.get(actKey).lastCompose=now;
                const lastAdmin=S.lastAdminMsgTs.get(groupId)||0;
                if(now-lastAdmin<SNIPER_WINDOW_MS) flag(jid,groupId,'PRESENCE_SNIPER',SNIPER_SCORE);
            } else if (s==='unavailable') {
                if(pData.connectedAt&&now-pData.connectedAt<GHOST_MS) flag(jid,groupId,'GHOST_CONNECT');
                pData.connectedAt=null;
            }
        }
    });
}

// ── Report Results ────────────────────────────────────────────
// منشن فردي فقط — بدون @الكل
async function reportResults(sock, chatId, triggerMsg) {
    const found = [...S.detected.values()].filter(e =>
        e.groupId === chatId && isConfirmed(e.jid, chatId)
    );

    // لا توجد نتائج — رسالة واضحة
    if (!found.length) {
        await sock.sendMessage(chatId, {
            text: `🔍 *نتائج الكشف*\n\n✅ _لم يتم كشف أي بوت حتى الآن._\n💡 _انتظر أكثر أو اكتب .كشف مرة أخرى_`,
        }, triggerMsg ? { quoted: triggerMsg } : {}).catch(() => {});
        return;
    }

    // ترتيب حسب قوة الدليل
    found.sort((a,b) => {
        const sc = e => (e.hard.has('ID_INSTANT')?100:0)+(e.hard.has('SHOCK_RECEIPT')?90:0)+e.score+(e.hard.size*10)+(e.soft.size*3);
        return sc(b)-sc(a);
    });

    // إعلان عدد النتائج أولاً
    await sock.sendMessage(chatId, {
        text: `📡 *نتائج الكشف — ${found.length} حساب مشبوه*\n_جاري إرسال التفاصيل..._`,
    }, triggerMsg ? { quoted: triggerMsg } : {}).catch(() => {});

    await new Promise(r => setTimeout(r, 800));

    // منشن فردي لكل بوت — بدون mass mention
    let counter = 1;
    for (const entry of found) {
        const jid     = entry.jid.includes('@') ? entry.jid : entry.jid + '@s.whatsapp.net';
        const signals = [...entry.hard, ...entry.soft].join(' · ');
        const method  = entry.hard.has('ID_INSTANT')         ? '🔴 ID فوري'
                      : entry.hard.has('SHOCK_RECEIPT')      ? '⚡ Shock Probe'
                      : entry.hard.has('JID_BOT_FINGERPRINT')? '🔎 JID Scan'
                      : entry.score >= 95                    ? `📡 Presence ${entry.score}%`
                      : '🔬 تحليل سلوكي';

        // منشن واحد فقط في كل رسالة
        await sock.sendMessage(chatId, {
            text: `@${norm(jid)}\n*🤖 بوت #${counter}* — ${method}\n\`${signals || 'signals'}\``,
            mentions: [jid],   // ← منشن فردي — لا @all
        }).catch(() => {});

        counter++;
        await new Promise(r => setTimeout(r, 800));
    }

    // تنظيف
    S.activeGroups.delete(chatId);
    S.lastAdminMsgTs.delete(chatId);
    for (const map of [S.detected, S.driftRing, S.correlLog, S.firstReads,
                       S.readCount, S.packetLog, S.lastActivity, S.baseline]) {
        for (const k of [...map.keys()]) {
            if (typeof k === 'string' && k.includes(`::${chatId}`)) map.delete(k);
        }
    }
    if (S.readOrder.has(chatId))     S.readOrder.delete(chatId);
    if (S.jidScanCache.has(chatId))  S.jidScanCache.delete(chatId);
    for (const k of [...S.msgActivity.keys()]) {
        if (k.includes(`::${chatId}`)) S.msgActivity.delete(k);
    }
}

// ═══════════════════════════════════════════════════════════
//  Plugin
// ═══════════════════════════════════════════════════════════
const KashfPlugin = {
    command:     'كشف',
    description: 'Silent Bot Scanner v9.1',
    elite:       'on',
    group:       true,   // ← يشتغل من المجموعة مباشرة
    prv:         false,
    lock:        'off',
};

async function execute({ sock, msg, BIDS, sender }) {
    const chatId  = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    startScanner(sock);

    // ══ في الخاص — اختيار المجموعة ══════════════════════════
    if (!isGroup) {
        if (_sessions.has(chatId)) return;

        let groups;
        try {
            const all = await sock.groupFetchAllParticipating();
            groups = Object.entries(all).map(([id,g]) => ({ id, name: g.subject || id }));
        } catch { await sock.sendMessage(chatId,{text:'❌ فشل جلب المجموعات.'},{quoted:msg}); return; }

        if (!groups.length) { await sock.sendMessage(chatId,{text:'❌ لا توجد مجموعات.'},{quoted:msg}); return; }

        const list = groups.map((g,i) => `*${i+1}.* ${g.name}`).join('\n');
        await sock.sendMessage(chatId, {
            text: `📡 *اختر رقم المجموعة للمراقبة:*\n\n${list}\n\n_أرسل الغاء للخروج_`,
        }, { quoted: msg }).catch(() => {});

        const cleanup = () => { sock.ev.off('messages.upsert', listener); _sessions.delete(chatId); };

        const listener = async ({ messages, type }) => {
            if (type !== 'notify') return;
            const m = messages[0];
            if (!m || m.key.remoteJid !== chatId || m.key.fromMe) return;
            const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').trim();
            if (text === 'الغاء' || text === 'إلغاء') { cleanup(); await sock.sendMessage(chatId,{text:'✅ تم الإلغاء.'}); return; }
            const num = parseInt(text);
            if (isNaN(num)||num<1||num>groups.length) { await sock.sendMessage(chatId,{text:'❌ رقم غير صحيح.'}); return; }
            const chosen = groups[num-1];
            await _activateGroup(sock, chosen.id, chosen.name, chatId, m);
            cleanup();
        };

        sock.ev.on('messages.upsert', listener);
        _sessions.set(chatId, { cleanup });
        setTimeout(() => { if (_sessions.has(chatId)) cleanup(); }, 300_000);
        return;
    }

    // ══ في المجموعة مباشرة — .كشف ═══════════════════════════
    // سجّل رسالة المشرف لكشف Presence Sniper
    S.lastAdminMsgTs.set(chatId, Date.now());

    if (!S.activeGroups.has(chatId)) {
        // أول مرة: فعّل وابدأ الفحص
        await _activateGroup(sock, chatId, null, chatId, msg);
    } else {
        // المراقبة نشطة: اعرض النتائج الآن
        await sock.sendMessage(chatId, {
            text: '🔍 _جاري استخراج النتائج..._',
        }, { quoted: msg }).catch(() => {});
        await reportResults(sock, chatId, msg);
    }
}

// ── تفعيل المراقبة + JID Scan + Shock Probe ──────────────────
async function _activateGroup(sock, groupId, groupName, ownerChatId, triggerMsg) {
    S.activeGroups.add(groupId);

    // subscribe presence (يشتغل حتى في مجموعة مقفلة)
    try {
        await sock.presenceSubscribe(groupId);
        const meta = await sock.groupMetadata(groupId).catch(() => null);
        if (meta?.participants) {
            for (const p of meta.participants.slice(0, 50)) {
                try { await sock.presenceSubscribe(p.id); } catch {}
            }
        }
    } catch {}

    // JID Scan فوري
    const jidBots = await scanJids(sock, groupId);

    const name = groupName || groupId;
    let confirmTxt = `✅ *تم تفعيل المراقبة*\n_${name}_\n\n`;

    if (jidBots?.length) {
        confirmTxt += `🔎 *بصمات JID مشبوهة:* ${jidBots.length}\n`;
        // بدون منشن هنا — فقط أرقام
        confirmTxt += jidBots.map(b => `• \`${norm(b.jid)}\` — ${b.reason}`).join('\n');
        confirmTxt += '\n\n';
    } else {
        confirmTxt += `✅ JIDs: لا بصمات مشبوهة\n\n`;
    }

    confirmTxt += `⚡ *Shock Probe* يبدأ خلال 5 ثوانٍ...\n`;
    confirmTxt += `📌 اكتب _.كشف_ بعد 30 ثانية لرؤية النتائج`;

    await sock.sendMessage(ownerChatId, { text: confirmTxt },
        triggerMsg ? { quoted: triggerMsg } : {}
    ).catch(() => {});

    // Shock Probe بعد 5 ثوانٍ
    setTimeout(() => sendShockProbe(sock, groupId), 5_000);

    // تقرير تلقائي بعد 30 ثانية
    setTimeout(() => reportResults(sock, groupId, null), 30_000);
}

const NovaUltra = KashfPlugin;
export default { NovaUltra, execute };
