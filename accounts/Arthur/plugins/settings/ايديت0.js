// ══════════════════════════════════════════════════════════════
//  ايديت.js — استمارة تحميل تيك توك
//  • خاص فقط
//  • 3 خطوات: اسم الطلب → منشن صاحبه → رابط التيك
//  • المنشن الأزرق من نمط غزو.js (onWhatsApp + mentionSet)
// ══════════════════════════════════════════════════════════════

import axios  from 'axios';
import fs     from 'fs-extra';
import path   from 'path';
import os     from 'os';
import { spawn } from 'child_process';

const NovaUltra = {
    command:     'ايدي',
    description: 'استمارة تحميل تيك توك مع بيانات الطلب',
    elite:       'off',
    group:       false,
    prv:         true,
    lock:        'off',
};

// ── helpers ──────────────────────────────────────────────────
const numOf   = jid => jid ? jid.split('@')[0].split(':')[0] : '';
const isPhone = jid => { const n = numOf(jid); return n.length >= 7 && n.length <= 13; };

// منشن مضمون: phoneJid + rawJid كلاهما في mentions
const mentionSet = (phoneJid, rawJid) =>
    [...new Set([phoneJid, rawJid].filter(Boolean))];

// جلب JID الحقيقي من رقم الهاتف عبر onWhatsApp (نفس غزو.js)
async function resolveToJid(sock, rawInput) {
    // احذف أي شيء غير أرقام
    const clean = rawInput.replace(/\D/g, '');
    if (!clean) return null;

    const tryJid = clean + '@s.whatsapp.net';
    try {
        const [info] = await sock.onWhatsApp(tryJid).catch(() => [{}]);
        if (info?.exists) {
            return {
                phone: info.jid || tryJid,
                lid:   info.lid  || null,
            };
        }
    } catch {}
    // fallback: نستخدم الرقم مباشرة
    return { phone: tryJid, lid: null };
}

// ── تيك توك download (نفس تيك_توك.js) ───────────────────────
async function downloadTikTok(url) {
    const res  = await axios.get(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Cookie':       'current_language=en',
                'User-Agent':   'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
            },
            timeout: 20_000,
        }
    );
    const d = res.data?.data;
    if (!d?.play) return null;
    return {
        videoUrl: d.hdplay || d.play,
        audio:    d.music  || null,
        title:    d.title  || '',
        author:   d.author?.nickname || d.author?.unique_id || '',
        type:     d.type   || 'video',
        images:   d.images || null,
    };
}

// ── yt-dlp helpers ──────────────────────────────────────────
let _ytdlpBin = null;
async function getYtdlpBin() {
    if (_ytdlpBin) return _ytdlpBin;
    for (const bin of ['yt-dlp', 'yt_dlp', 'python3 -m yt_dlp']) {
        try {
            await new Promise((res, rej) => {
                const p = spawn(bin.split(' ')[0], [...bin.split(' ').slice(1), '--version']);
                p.on('close', c => c === 0 ? res() : rej());
                p.on('error', rej);
                setTimeout(() => { try { p.kill(); } catch {} rej(new Error('timeout')); }, 4000);
            });
            _ytdlpBin = bin; return bin;
        } catch {}
    }
    throw new Error('yt-dlp غير مثبت');
}

// تحميل تيك توك بأعلى جودة بـ yt-dlp — timeout 20 ثانية صارم
async function downloadTikTokHD(url) {
    const safeUrl = url.replace(/[`$\\]/g, '');
    const bin     = await getYtdlpBin();
    const outDir  = path.join(os.tmpdir(), `tkedit_${Date.now()}`);
    fs.ensureDirSync(outDir);
    const cleanup = () => { try { fs.removeSync(outDir); } catch {} };

    // تيك توك فيديوهاته مدمجة — لا نحتاج merge/ffmpeg
    // نطلب best بدون + حتى لا يحتاج ffmpeg
    const formats = [
        'best[ext=mp4]',   // الأفضل mp4 مدمج (الحالة الغالبة في تيك توك)
        'best',            // أي صيغة
    ];

    const parts   = bin.split(' ');
    const binCmd  = parts[0];
    const binPre  = parts.slice(1);

    const baseArgs = [
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificates',   // يمنع تأخير التحقق من SSL
        '--socket-timeout', '10',
        '--retries', '1',            // محاولة واحدة فقط لتوفير الوقت
        '--extractor-args', 'tiktok:cdn_fallback=1',  // CDN بديل لو الأول بطيء
        '--output', path.join(outDir, 'video.%(ext)s'),
    ];

    const runFmt = (fmt) => new Promise((res, rej) => {
        const allArgs = [...baseArgs, '-f', fmt, safeUrl];
        const proc    = spawn(binCmd, [...binPre, ...allArgs], { env: process.env });
        let stderr = '';
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
            if (code === 0) res();
            else rej(new Error(stderr.slice(-200) || `exit ${code}`));
        });
        proc.on('error', rej);
        // timeout 20 ثانية صارم
        const t = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch {}
            rej(new Error('yt-dlp timeout'));
        }, 20_000);
        proc.on('close', () => clearTimeout(t));
    });

    let lastErr = null;
    for (const fmt of formats) {
        try {
            await runFmt(fmt);
            lastErr = null;
            break;
        } catch (e) {
            lastErr = e;
            console.error(`[ايديت/yt-dlp] fmt="${fmt}" →`, e.message?.slice(0, 100));
        }
    }

    if (lastErr) { cleanup(); throw lastErr; }

    const files = fs.readdirSync(outDir)
        .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'));
    if (!files.length) { cleanup(); throw new Error('yt-dlp: لم يُحمَّل أي ملف'); }

    const chosen = files
        .map(f => ({ f, size: fs.statSync(path.join(outDir, f)).size }))
        .sort((a, b) => b.size - a.size)[0].f;

    return { filePath: path.join(outDir, chosen), cleanup };
}

// ── جلسات نشطة ───────────────────────────────────────────────
const activeSessions = new Map();
const wait = ms => new Promise(r => setTimeout(r, ms));

async function execute({ sock, msg, args, BIDS }) {
    const chatId = msg.key.remoteJid;

    // منع الجلسات المتعددة
    if (activeSessions.has(chatId)) {
        await sock.sendMessage(chatId, {
            text: '⚠️ _لديك طلب قيد التنفيذ، أكمله أو انتظر._',
        }, { quoted: msg });
        return;
    }

    const session = { step: 1, requestName: '', requesterJid: null, requesterPhone: null };
    activeSessions.set(chatId, session);

    const send = txt => sock.sendMessage(chatId, { text: txt }).catch(() => {});

    // timeout: 5 دقائق
    const timeout = setTimeout(() => {
        if (activeSessions.has(chatId)) {
            activeSessions.delete(chatId);
            sock.ev.off('messages.upsert', listener);
            send('⏰ _انتهت مدة الجلسة._');
        }
    }, 300_000);

    const cleanup = () => {
        clearTimeout(timeout);
        activeSessions.delete(chatId);
        sock.ev.off('messages.upsert', listener);
    };

    // ── الخطوة 1: اسم الطلب ──────────────────────────────────
    await send(
`~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

\`⌬━╌⤣ تـنـفيـذ ايـــدت ❄️ ⤤╌━⌬\`

_*📌 الخطوة 1/3*_
_اكتب *اسم الطلب* (مثال: مادارا)_

_أو اكتب *إلغاء* للخروج_

~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~`
    );

    const listener = async ({ messages, type }) => {
        if (type !== 'notify') return;
        const m = messages[0];
        if (!m?.message || m.key.remoteJid !== chatId || m.key.fromMe) return;

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();

        if (text === 'إلغاء' || text === 'الغاء') {
            cleanup();
            await send('✅ _تم الإلغاء._');
            return;
        }

        const sess = activeSessions.get(chatId);
        if (!sess) return;

        // ── Step 1: اسم الطلب ────────────────────────────────
        if (sess.step === 1) {
            if (!text || text.length < 1) {
                await send('❌ _اكتب اسم الطلب._');
                return;
            }
            sess.requestName = text;
            sess.step = 2;
            await send(
`~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

_*📌 الخطوة 2/3*_
_أرسل *رقم هاتف* صاحب الطلب أو *منشنه* (@اسمه)_

_مثال:_ \`966501234567\`

~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~`
            );
            return;
        }

        // ── Step 2: رقم/منشن صاحب الطلب ─────────────────────
        if (sess.step === 2) {
            let rawJid = null;

            // منشن مباشر في الرسالة
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (mentioned) {
                rawJid = mentioned;
            } else if (/^\d{7,15}$/.test(text.replace(/\D/g,''))) {
                rawJid = text.replace(/\D/g,'') + '@s.whatsapp.net';
            } else {
                await send('❌ _أرسل رقم هاتف صحيح أو منشن الشخص._');
                return;
            }

            await send('🔍 _جاري التحقق من الرقم..._');
            const resolved = await resolveToJid(sock, numOf(rawJid));

            if (!resolved?.phone) {
                await send('❌ _الرقم غير مسجل في واتساب._');
                return;
            }

            sess.requesterPhone = resolved.phone;
            sess.requesterLid   = resolved.lid;
            sess.step = 3;

            await send(
`~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

_*📌 الخطوة 3/3*_
_أرسل *رابط تيك توك* للفيديو المطلوب_

_مثال:_ \`https://vt.tiktok.com/...\`

~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~`
            );
            return;
        }

        // ── Step 3: رابط تيك توك ─────────────────────────────
        if (sess.step === 3) {
            const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
            if (!url || !/(tiktok\.com|vt\.tiktok|vm\.tiktok)/i.test(url)) {
                await send('❌ _أرسل رابط تيك توك صحيح._');
                return;
            }

            sess.step = 4; // منع تكرار الطلب
            await sock.sendMessage(chatId, { react: { text: '🕒', key: m.key } }).catch(() => {});
            await send('⏳ _جاري تحميل الفيديو..._');

            try {
                const phoneJid = sess.requesterPhone;
                const rawJid   = sess.requesterLid || phoneJid;

                const caption =
`~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

\`⌬━╌⤣ تـنـفيـذ ايـــدت ❄️ ⤤╌━⌬\`

_*✦  الطـ🦦ــلب ↫〘 〔 ${sess.requestName} 〕〙*_

_*✦ صـاحب الـ👤ـطلب ↫〘   @${numOf(phoneJid)}   〙*_

*✦ المـ⭐ـسؤول ↫〘 ارثـــ🪶ـــر 〙*

~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

*『𝐀𝚛𝚟𝚊𝚗𝚒𝚊╷🎞╵ 𝐄𝚍𝚒𝚝𝚘𝚛』*`;

                // ── yt-dlp: أعلى جودة — timeout 20 ثانية ──────
                let sent = false;
                try {
                    const { filePath, cleanup: dlClean } = await downloadTikTokHD(url);
                    const buf = await fs.promises.readFile(filePath);
                    const sz  = buf.length;
                    dlClean();

                    if (sz > 70 * 1024 * 1024) {
                        // فيديو كبير → مستند
                        await sock.sendMessage(chatId, {
                            document: buf,
                            mimetype: 'video/mp4',
                            fileName: `${sess.requestName || 'edit'}.mp4`,
                            caption,
                            mentions: mentionSet(phoneJid, rawJid),
                        }).catch(() => {});
                    } else {
                        await sock.sendMessage(chatId, {
                            video:    buf,
                            mimetype: 'video/mp4',
                            caption,
                            mentions: mentionSet(phoneJid, rawJid),
                        }).catch(() => {});
                    }
                    sent = true;
                } catch (ytErr) {
                    console.error('[ايديت/yt-dlp] فشل:', ytErr.message);
                    // fallback → tikwm
                    const dl = await downloadTikTok(url);
                    if (dl?.videoUrl) {
                        await sock.sendMessage(chatId, {
                            video:    { url: dl.videoUrl },
                            caption,
                            mentions: mentionSet(phoneJid, rawJid),
                        }).catch(() => {});
                        sent = true;
                    } else if (dl?.type === 'image' && Array.isArray(dl.images)) {
                        for (const imgUrl of dl.images) {
                            await sock.sendMessage(chatId, {
                                image:    { url: imgUrl },
                                caption,
                                mentions: mentionSet(phoneJid, rawJid),
                            }).catch(() => {});
                            await wait(300);
                        }
                        if (dl.audio) {
                            await sock.sendMessage(chatId, {
                                audio: { url: dl.audio }, mimetype: 'audio/mp4',
                            }).catch(() => {});
                        }
                        sent = true;
                    }
                }

                if (!sent) {
                    await send('❌ _فشل تحميل الفيديو من جميع المصادر._');
                    cleanup();
                    return;
                }

                await sock.sendMessage(chatId, { react: { text: '☑️', key: m.key } }).catch(() => {});

            } catch (e) {
                console.error('[ايديت] خطأ:', e.message);
                await send(`❌ _خطأ أثناء التحميل: ${e.message?.slice(0,80)}_`);
            }

            cleanup();
        }
    };

    sock.ev.on('messages.upsert', listener);
}

export default { NovaUltra, execute };
