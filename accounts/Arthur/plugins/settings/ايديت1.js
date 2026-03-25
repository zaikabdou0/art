// ══════════════════════════════════════════════════════════════
//  ايديت.js — استمارة تحميل تيك توك
//  • خاص فقط
//  • 3 خطوات: اسم الطلب → منشن صاحبه → رابط التيك
//  • المنشن الأزرق من نمط غزو.js (onWhatsApp + mentionSet)
// ══════════════════════════════════════════════════════════════

import axios from 'axios';

const NovaUltra = {
    command:     'ايدت',
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

_أو. اكتب *إلغاء* للخروج_

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
                const dl = await downloadTikTok(url);
                if (!dl?.videoUrl && dl?.type !== 'image') {
                    await send('❌ _فشل تحميل الفيديو. تأكد من الرابط._');
                    cleanup();
                    return;
                }

                const phoneJid = sess.requesterPhone;
                const rawJid   = sess.requesterLid || phoneJid;

                // ── الاستمارة النهائية ──────────────────────────
                const caption =
`~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

\`⌬━╌⤣ تـنـفيـذ ايـــدت ❄️ ⤤╌━⌬\`

_*✦  الطـ🦦ــلب ↫〘 〔 ${sess.requestName} 〕〙*_

_*✦ صـاحب الـ👤ـطلب ↫〘   @${numOf(phoneJid)}   〙*_

*✦ المـ⭐ـسؤول ↫〘 ايـــانـــو 〙*

~*◉━━━━── •⧉ 🎞️ ⧉• ──━━━━◉*~

*『𝐀𝚛𝚟𝚊𝚗𝚒𝚊╷🎞╵ 𝐄𝚍𝚒𝚝𝚘𝚛』*`;

                // إرسال حسب نوع المحتوى
                if (dl.type === 'image' && Array.isArray(dl.images)) {
                    // صور slideshow
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
                            audio:    { url: dl.audio },
                            mimetype: 'audio/mp4',
                        }).catch(() => {});
                    }
                } else {
                    await sock.sendMessage(chatId, {
                        video:    { url: dl.videoUrl },
                        caption,
                        mentions: mentionSet(phoneJid, rawJid),
                    }).catch(() => {});
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
