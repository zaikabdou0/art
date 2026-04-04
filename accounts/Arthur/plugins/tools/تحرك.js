// ══════════════════════════════════════════════════════════════
//  تحرك.js — بحث وإرسال GIFs كألبوم
//  نفس بيئة ايديت.js
// ══════════════════════════════════════════════════════════════

import axios from 'axios';
import { generateWAMessageFromContent, generateWAMessage, delay } from '@whiskeysockets/baileys';

const NovaUltra = {
    command:     'تحرك',
    description: 'يبحث عن صور متحركة GIF ويرسلها كألبوم',
    elite:       'off',
    group:       false,
    prv:         false,
    lock:        'off',
};

// ── إرسال الألبوم ─────────────────────────────────────────────
async function sendAlbumMessage(sock, jid, medias, msg, options = {}) {
    if (typeof jid !== 'string') throw new TypeError(`jid must be string`);
    if (!Array.isArray(medias) || medias.length < 2) throw new RangeError('Minimum 2 media required');

    for (const media of medias) {
        if (!media.type || (media.type !== 'image' && media.type !== 'video'))
            throw new TypeError(`Invalid media type: ${media.type}`);
        if (!media.data || (!media.data.url && !Buffer.isBuffer(media.data)))
            throw new TypeError('Invalid media data');
    }

    const caption   = options.text || options.caption || '';
    const waitDelay = !isNaN(options.delay) ? options.delay : 500;

    const album = generateWAMessageFromContent(jid, {
        messageContextInfo: {},
        albumMessage: {
            expectedImageCount: medias.filter(m => m.type === 'image').length,
            expectedVideoCount: medias.filter(m => m.type === 'video').length,
            ...(msg ? {
                contextInfo: {
                    remoteJid:     msg.key.remoteJid,
                    fromMe:        msg.key.fromMe,
                    stanzaId:      msg.key.id,
                    participant:   msg.key.participant || msg.key.remoteJid,
                    quotedMessage: msg.message,
                },
            } : {}),
        },
    }, { userJid: sock.user.id, quoted: msg });

    await sock.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id });

    for (let i = 0; i < medias.length; i++) {
        const { type, data } = medias[i];
        const mediaMsg = await generateWAMessage(
            album.key.remoteJid,
            { [type]: data, ...(i === 0 ? { caption } : {}) },
            { upload: sock.waUploadToServer }
        );
        mediaMsg.message.messageContextInfo = {
            messageAssociation: { associationType: 1, parentMessageKey: album.key },
        };
        await sock.relayMessage(mediaMsg.key.remoteJid, mediaMsg.message, { messageId: mediaMsg.key.id });
        await delay(waitDelay);
    }

    return album;
}

// ── جلسات نشطة ───────────────────────────────────────────────
const activeSessions = new Map();

async function execute({ sock, msg, args }) {
    const chatId = msg.key.remoteJid;

    if (activeSessions.has(chatId)) {
        await sock.sendMessage(chatId, {
            text: '⚠️ _لديك طلب قيد التنفيذ، أكمله أو انتظر._',
        }, { quoted: msg }).catch(() => {});
        return;
    }

    const name = args.join(' ').trim();

    // ── لو أرسل الاسم مباشرة مع الأمر ─────────────────────
    if (name) {
        await runSearch(sock, msg, chatId, name);
        return;
    }

    // ── لا يوجد اسم → اطلبه ─────────────────────────────────
    activeSessions.set(chatId, { step: 1 });

    await sock.sendMessage(chatId, {
        text: '🔍 *اكتب اسم الشخصية أو الـ GIF المطلوب:*',
    }, { quoted: msg }).catch(() => {});

    const timeout = setTimeout(() => {
        activeSessions.delete(chatId);
        sock.ev.off('messages.upsert', listener);
        sock.sendMessage(chatId, { text: '⏰ _انتهت مدة الانتظار._' }).catch(() => {});
    }, 60_000);

    const cleanup = () => {
        clearTimeout(timeout);
        activeSessions.delete(chatId);
        sock.ev.off('messages.upsert', listener);
    };

    const listener = async ({ messages, type }) => {
        if (type !== 'notify') return;
        const m = messages[0];
        if (!m?.message || m.key.remoteJid !== chatId || m.key.fromMe) return;

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
        if (!text) return;

        if (text === 'إلغاء' || text === 'الغاء') {
            cleanup();
            await sock.sendMessage(chatId, { text: '✅ _تم الإلغاء._' }).catch(() => {});
            return;
        }

        cleanup();
        await runSearch(sock, m, chatId, text);
    };

    sock.ev.on('messages.upsert', listener);
}

// ── منطق البحث والإرسال ─────────────────────────────────────
async function runSearch(sock, msg, chatId, name) {
    try {
        await sock.sendMessage(chatId, { react: { text: '🕒', key: msg.key } }).catch(() => {});

        const apiUrl = 'https://deliriusapi-official.vercel.app';
        const { data: json } = await axios.get(
            `${apiUrl}/search/tenor?q=${encodeURIComponent(name)}`,
            { timeout: 15_000 }
        );
        const gifs = json?.data;

        if (!gifs || gifs.length < 2) {
            await sock.sendMessage(chatId, { react: { text: '✖️', key: msg.key } }).catch(() => {});
            return sock.sendMessage(chatId, {
                text: '❌ لم يتم العثور على نتائج كافية.',
            }, { quoted: msg }).catch(() => {});
        }

        const maxItems = Math.min(gifs.length, 15);
        const medias   = gifs.slice(0, maxItems).map(gif => ({
            type: 'video',
            data: { url: gif.mp4 },
        }));

        const captionText =
`❀ G I F - S E A R C H ❀

✦ البحث: *${name}*
✧ النتائج: *${maxItems}*`;

        await sendAlbumMessage(sock, chatId, medias, msg, { caption: captionText });
        await sock.sendMessage(chatId, { react: { text: '✔️', key: msg.key } }).catch(() => {});

    } catch (e) {
        console.error('[تحرك]', e?.message);
        await sock.sendMessage(chatId, { react: { text: '✖️', key: msg.key } }).catch(() => {});
        await sock.sendMessage(chatId, {
            text: `⚠️ حدث خطأ.\n\n\`${e?.message?.slice(0, 100) || 'خطأ غير معروف'}\``,
        }, { quoted: msg }).catch(() => {});
    }
}

export default { NovaUltra, execute };
