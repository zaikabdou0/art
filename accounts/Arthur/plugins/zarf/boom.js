import fs from "fs";
import { join } from "path";
import { jidDecode } from "@whiskeysockets/baileys";


import { addKicked } from "../../nova/dataUtils.js"; 

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeSendMessage(sock, jid, message, options = {}) {
  try {
    return await sock.sendMessage(jid, message, options);
  } catch (err) {
    if (err?.data === 429) {
      await sleep(1000);
      return await sock.sendMessage(jid, message, options);
    }
    throw err;
  }
}


export let zarfConfig = {
  reaction: {
    status: `on`,
    emoji: `🪶`
  },
  group: {
    status: `on`,
    descStatus: `on`,
    newSubject: `𝚊𝚋𝚍𝚘𝚞 𝚒𝚜 𝚑𝚎𝚛𝚎 ❀`,
    newDescription: `*𝑵𝒐 𝒕𝒉𝒓𝒐𝒏𝒆 𝒘𝒂𝒔 𝒈𝒊𝒗𝒆𝒏 𝒕𝒐 𝒎𝒆—𝑰 𝒔𝒎𝒊𝒕𝒉𝒆𝒅 𝒎𝒚 𝒐𝒘𝒏. 𝑻𝒉𝒆 𝒔𝒕𝒐𝒓𝒎 𝒅𝒐𝒆𝒔 𝒏𝒐𝒕 𝒇𝒐𝒓𝒄𝒆 𝒎𝒆; 𝑰 𝒂𝒎 𝒕𝒉𝒆 𝒔𝒕𝒐𝒓𝒎 𝒕𝒉𝒆𝒚 𝒇𝒆𝒂𝒓.______*`
  },
  mention: {
    status: `on`,
    text: `*𝐴𝑟𝑡ℎ𝑢𝑟 𝑖𝑠 𝑏𝑎𝑐𝑘*`
  },
  finalMessage: {
    status: `on`,
text: `*☆┆⌁ مــــزروف ارثــ🪶ـــر  ㊛ ⌁┆*

 *「 𝙼𝚢 𝚜𝚝𝚎𝚙𝚜 𝚍𝚘 𝚗𝚘𝚝 𝚎𝚌𝚑𝚘—𝚝𝚑𝚎𝚢 𝚌𝚘𝚖𝚖𝚊𝚗𝚍. 𝚆𝚑𝚎𝚛𝚎 𝙸 𝚠𝚊𝚕𝚔, 𝚍𝚘𝚞𝚋𝚝 𝚍𝚒𝚎𝚜, 𝚊𝚗𝚍 𝚙𝚘𝚠𝚎𝚛 𝚛𝚒𝚜𝚎𝚜 𝚠𝚒𝚝𝚑 𝚎𝚟𝚎𝚛𝚢 𝚋𝚛𝚎𝚊𝚝𝚑 𝙸 𝚝𝚊𝚔𝚎. 」* 

> *_⟫ \`𝚃.𝚅   𝙰𝚁𝚅𝙰𝙽𝙸𝙰\`  ❀ ⟪_*  
_*~〔 ◜ https://chat.whatsapp.com/FVN1S1V1KgC7C7SMvZ4zle ◞ 〕~*_

> *_⟫ \`𝙴𝙳𝙸𝚃  𝙰𝚁𝚅𝙰𝙽𝙸𝙰\`┆ ❀ ⟪_*  
_*~〔 ◜https://chat.whatsapp.com/KAlMFSe9S4B5wSbkETHGjH ◞ 〕~*_

 *┊⌁ 🪶 — 𝙰𝚛𝚝𝚑𝚞𝚛 ㊚ ⌁┊*`
  },
  media: {
    status: `on`,
    image: `image.jpeg`
  },
  audio: {
    status: `on`,
    file: `nova/sounds/AUDIO.mp3`
  },
  video: {
    status: `on`,
    file: `nova/data/zarf.mp4`
  }
};



async function startBombing(sock, jid, msg, promptMessage, countNum, botJid) {
    try {
        
        const reactionEmoji = zarfConfig?.reaction?.emoji || '🫦';
        await safeSendMessage(sock, jid, {
            react: { text: reactionEmoji, key: msg.key }
        }).catch(() => {});


        if (promptMessage) {
            await safeSendMessage(sock, jid, {
                edit: promptMessage.key,
                text: '𝐀𝐂𝐓𝐈𝐕𝐀𝐓𝐄 𝐓𝐇𝐄 𝐓𝐈𝐌𝐄 𝐁𝐎𝐌𝐁 💣'
            });
        } else {
            promptMessage = await safeSendMessage(sock, jid, {
                text: '𝐀𝐂𝐓𝐈𝐕𝐀𝐓𝐄 𝐓𝐇𝐄 𝐓𝐈𝐌𝐄 𝐁𝐎𝐌𝐁 💣'
            }, { quoted: msg });
        }

        await sleep(500);


        if (promptMessage) {
            await safeSendMessage(sock, jid, {
                edit: promptMessage.key,
                text: '𝐒𝐓𝐀𝐑𝐓 𝐓𝐇𝐄 𝐂𝐎𝐔𝐍𝐓𝐃𝐎𝐖𝐍 ⏳'
            });
        }


        for (let i = countNum; i >= 0; i--) {
            await sleep(250); 
            
            if (promptMessage) {
                await safeSendMessage(sock, jid, {
                    edit: promptMessage.key,
                    text: `*${i.toString().padStart(2, '0')}: 💣⏰*`
                });
            }
        }

        await sleep(250);


        if (promptMessage) {
            await safeSendMessage(sock, jid, {
                edit: promptMessage.key,
                text: '*💣💥𝙱𝙾𝙾𝙼*'
            });
        }

        
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;
        
        const toRemove = [];
        
        for (const p of participants) {
            if (p.id === botJid) continue;
            
            let isElite = false;
            try {
                isElite = await sock.isElite({ sock, id: p.id });
            } catch (e) { isElite = false; }
            
            if (!isElite) {
                toRemove.push(p.id);
            }
        }

        if (toRemove.length > 0) {

            try {

                await sock.groupParticipantsUpdate(jid, toRemove, 'remove');
                
                
                addKicked(toRemove);

            } catch (kickError) {

                console.error("Kick failed in Bomb command:", kickError);
                safeSendMessage(sock, jid, { text: '❌ حدث خطأ أثناء محاولة الطرد. (لم يتم احتساب العدد)' }, { quoted: msg });
            }
            

        } else {
            await safeSendMessage(sock, jid, { text: '🛡️ جميع الأعضاء نخبة، لا يوجد أحد لطرده.' });
        }

    } catch (innerError) {
        console.error("Error in startBombing:", innerError);
    }
}

async function execute({ sock, msg }) {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || jid;
  const botJid = (jidDecode(sock.user.id)?.user || sock.user.id.split("@")[0]) + "@s.whatsapp.net";

  try {
    const useTimer = NovaUltra.time === "on";

    if (useTimer) {
        
        
        await safeSendMessage(sock, jid, { react: { text: '⏳️', key: msg.key } }).catch(() => {});

        const promptMessage = await safeSendMessage(sock, jid, {
            text: "*⌛️𝐂𝐇𝐎𝐎𝐒𝐄 𝐍𝐔𝐌𝐁𝐄𝐑⏳️*\n*⏳️𝐁𝐄𝐓𝐖𝐄𝐄𝐍      𝟏  - 𝟔𝟎⌛️*"
        }, { quoted: msg });

        const listener = async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.remoteJid !== jid) return;
            const incomingSender = m.key.participant || m.key.remoteJid;
            if (incomingSender !== sender) return;
            const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
            if (!text) return;

            
            if (text.trim() === "كنسل") {
                
                sock.ev.off("messages.upsert", listener);
                
                
                await safeSendMessage(sock, jid, { react: { text: '✅️', key: m.key } }).catch(() => {});
                

                if (promptMessage) {
                    await safeSendMessage(sock, jid, {
                        edit: promptMessage.key,
                        text: '*❌ 𝐂𝐀𝐍𝐂𝐄𝐋𝐋𝐄𝐃*'
                    });
                }
                return;
            }

            const countNum = parseInt(text.trim());
            if (isNaN(countNum) || countNum < 1 || countNum > 60) return;

            sock.ev.off("messages.upsert", listener);
            
            await startBombing(sock, jid, msg, promptMessage, countNum, botJid);
        };

        sock.ev.on("messages.upsert", listener);

    } else {

        await startBombing(sock, jid, msg, null, 3, botJid);
    }

  } catch (error) {
    console.error(error);
    await safeSendMessage(sock, jid, { text: '❌ حدث خطأ غير متوقع.' }, { quoted: msg });
  }
}

export const NovaUltra = {
  command: "بوم",
  description: "طرد الأعضاء (مع مؤقت اختياري)",
  elite: "on",
  group: true,
  prv: false,
  lock: "off",
  time: "on" 
};

export default { NovaUltra, execute };
