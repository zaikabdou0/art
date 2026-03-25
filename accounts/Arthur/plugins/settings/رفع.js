// ══════════════════════════════════════════════════════════════
//  رفع.js — رفع جودة الصور بـ AI
//  DeepAI (srgan) أولاً → Replicate (real-esrgan) fallback
//  يتعامل مع Cold Start حتى 100 ثانية
// ══════════════════════════════════════════════════════════════

import axios from 'axios';
import FormData from 'form-data';

const DEEPAI_KEY    = process.env.DEEPAI_KEY    || 'd595c185-62ef-48a2-b8f5-a7833dad11b5';
const REPLICATE_KEY = process.env.REPLICATE_KEY || 'r8_IdtMDruku78yJ1L4lmeIAxT5cshdnYy0ezEc8';

// ── النموذج المستخدم في Replicate ────────────────────────────
// real-esrgan: أفضل نموذج مجاني لرفع الجودة 4x
const REPLICATE_MODEL_VERSION =
    'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b';

const NovaUltra = {
    command:     'جودة',
    description: 'رفع جودة الصورة 4x (AI Upscale)',
    elite:       'off',
    group:       false,
    prv:         false,
    lock:        'off',
};

// ══════════════════════════════════════════════════════════════
//  DeepAI — torch-srgan
//  سريع (5-15 ثانية)، يقبل ملف مباشر
// ══════════════════════════════════════════════════════════════
async function upscaleDeepAI(imageBuffer) {
    const form = new FormData();
    form.append('image', imageBuffer, {
        filename:    'image.jpg',
        contentType: 'image/jpeg',
    });

    const resp = await axios.post('https://api.deepai.org/api/torch-srgan', form, {
        headers: { ...form.getHeaders(), 'api-key': DEEPAI_KEY },
        timeout: 60_000,
    });

    const url = resp.data?.output_url;
    if (!url) throw new Error(`DeepAI: لم يرجع رابط — ${JSON.stringify(resp.data)}`);
    return url;
}

// ══════════════════════════════════════════════════════════════
//  Replicate — real-esrgan
//  أقوى جودة، لكن يعمل بنظام polling
//  Cold Start: أول طلب بعد فترة سكون يأخذ 30-60 ثانية
//  الحل: نزيد المحاولات إلى 20 × 5s = 100 ثانية max
// ══════════════════════════════════════════════════════════════
async function upscaleReplicate(imageBuffer, onWakeUp) {
    // حوّل الصورة لـ base64 — الطريقة المضمونة لأي حجم
    const base64  = imageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    // خطوة 1: أنشئ المهمة في Replicate
    const create = await axios.post(
        'https://api.replicate.com/v1/predictions',
        {
            version: REPLICATE_MODEL_VERSION,
            input:   { image: dataUrl, scale: 4, face_enhance: false },
        },
        {
            headers: {
                'Authorization': `Token ${REPLICATE_KEY}`,
                'Content-Type':  'application/json',
            },
            timeout: 20_000,
        }
    );

    const predId = create.data?.id;
    if (!predId) throw new Error(`Replicate: فشل إنشاء المهمة — ${JSON.stringify(create.data)}`);

    // خطوة 2: polling
    // - المحاولات 20 × 5s = 100 ثانية (يكفي للـ Cold Start)
    // - بعد 6 محاولات (30s) نفترض أن النموذج كان نائماً ونبلّغ المستخدم
    let wakeUpNotified = false;

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 5_000));

        // لو الانتظار تجاوز 30 ثانية → النموذج كان نائماً (Cold Start)
        if (i === 5 && !wakeUpNotified) {
            wakeUpNotified = true;
            onWakeUp?.(); // أبلغ المستخدم
        }

        const poll = await axios.get(
            `https://api.replicate.com/v1/predictions/${predId}`,
            {
                headers: { 'Authorization': `Token ${REPLICATE_KEY}` },
                timeout: 10_000,
            }
        );

        const { status, output, error } = poll.data || {};

        if (status === 'succeeded') {
            // output يكون رابطاً مباشراً أو مصفوفة
            return Array.isArray(output) ? output[0] : output;
        }
        if (status === 'failed') {
            throw new Error(`Replicate: فشلت المعالجة — ${error || 'unknown'}`);
        }
        // starting / processing → نكمل الانتظار
    }

    throw new Error('Replicate: انتهى وقت الانتظار (100 ثانية)');
}

// ══════════════════════════════════════════════════════════════
//  التحقق من صحة مفتاح Replicate
//  يستدعى مرة واحدة عند تحميل الملف
// ══════════════════════════════════════════════════════════════
let _replicateVerified = null; // null=لم يُفحص، true=يعمل، false=خطأ

async function checkReplicateKey() {
    if (_replicateVerified !== null) return _replicateVerified;
    try {
        // endpoint بسيط — فقط للتحقق من المفتاح بدون إنشاء مهمة
        const resp = await axios.get('https://api.replicate.com/v1/account', {
            headers: { 'Authorization': `Token ${REPLICATE_KEY}` },
            timeout: 8_000,
        });
        _replicateVerified = resp.status === 200;
        console.log('[رفع] Replicate key:', _replicateVerified ? '✅ صحيح' : '❌ خطأ');
    } catch (e) {
        _replicateVerified = false;
        console.error('[رفع] Replicate key خطأ:', e.response?.status, e.message);
    }
    return _replicateVerified;
}

// تحقق عند تحميل الملف (background, لا يوقف التشغيل)
checkReplicateKey().catch(() => {});

// ══════════════════════════════════════════════════════════════
//  execute
// ══════════════════════════════════════════════════════════════
async function execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;

    // استخراج الصورة — من الرسالة الحالية أو المقتبسة
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = msg.message?.imageMessage || quoted?.imageMessage || null;

    if (!imgMsg) {
        return sock.sendMessage(chatId, {
            text: '📸 _ردّ على صورة أو أرسل صورة مع .رفع_',
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🔬', key: msg.key } }).catch(() => {});
    const statusMsg = await sock.sendMessage(chatId, {
        text: '🔬 _جاري رفع الجودة..._',
    }, { quoted: msg });

    // دالة تحديث رسالة الحالة
    const updateStatus = async text => {
        try {
            await sock.sendMessage(chatId, {
                text,
                edit: statusMsg.key,
            });
        } catch {
            await sock.sendMessage(chatId, { text }, { quoted: msg }).catch(() => {});
        }
    };

    try {
        // ── تحميل الصورة من واتساب ───────────────────────────
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        let imageBuffer;
        try {
            const dlMsg = quoted?.imageMessage ? { message: quoted, key: msg.key } : msg;
            imageBuffer = await downloadMediaMessage(dlMsg, 'buffer', {}, {
                logger:           console,
                reuploadRequest:  sock.updateMediaMessage,
            });
        } catch {
            // fallback
            const r = await axios.get(imgMsg.url || imgMsg.directPath, {
                responseType: 'arraybuffer', timeout: 30_000,
            });
            imageBuffer = Buffer.from(r.data);
        }

        if (!imageBuffer?.length) throw new Error('لم يتم تحميل الصورة');

        // ── رفع الجودة: DeepAI أولاً ──────────────────────────
        let resultUrl  = null;
        let usedMethod = '';

        try {
            await updateStatus('🔬 _جاري رفع الجودة بـ DeepAI..._');
            resultUrl  = await upscaleDeepAI(imageBuffer);
            usedMethod = 'DeepAI (srgan)';
        } catch (e) {
            console.error('[رفع/DeepAI]', e.message);

            // ── Replicate كـ fallback ──────────────────────────
            const keyOk = await checkReplicateKey();
            if (!keyOk) throw new Error('DeepAI فشل ومفتاح Replicate غير صحيح');

            await updateStatus('🔁 _DeepAI فشل، جاري المحاولة بـ Replicate..._');

            resultUrl = await upscaleReplicate(imageBuffer, () => {
                // يُستدعى بعد 30 ثانية لو النموذج كان نائماً
                updateStatus('⏳ _النموذج كان نائماً، جاري تشغيله (30-60 ثانية)..._').catch(() => {});
            });
            usedMethod = 'Replicate (real-esrgan)';
        }

        if (!resultUrl) throw new Error('لم يُرجع الـ API رابطاً للصورة');

        // ── تحميل الصورة المحسّنة ─────────────────────────────
        await updateStatus('📥 _جاري تحميل الصورة المحسّنة..._');
        const enhanced = await axios.get(resultUrl, {
            responseType: 'arraybuffer',
            timeout:      60_000,
        });

        // ── إرسال النتيجة ─────────────────────────────────────
        await sock.sendMessage(chatId, {
            image:   Buffer.from(enhanced.data),
            caption: `✨ *تم رفع الجودة بنجاح*\n_بواسطة: ${usedMethod}_`,
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '☑️', key: msg.key } }).catch(() => {});
        await updateStatus('✅ _تم رفع الجودة بنجاح!_');

    } catch (e) {
        console.error('[رفع] خطأ نهائي:', e.message);
        await sock.sendMessage(chatId, { react: { text: '✖️', key: msg.key } }).catch(() => {});
        await updateStatus(`❌ *فشل رفع الجودة*\n_${e.message?.slice(0,100)}_`);
    }
}

export default { NovaUltra, execute };
