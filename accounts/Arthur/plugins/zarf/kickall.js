import { jidDecode } from "@whiskeysockets/baileys";

import { addKicked } from "../../nova/dataUtils.js"; 

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
    status: `off`,
    file: `nova/sounds/AUDIO.mp3`
  },
  video: {
    status: `on`,
    file: `nova/data/zarf.mp4`
  }
};

export const NovaUltra = {
    command: "طرد",
    description: "طرد جميع الأعضاء (عدا النخبة) وحسابهم",
    elite: "on",      
    group: true,      
    prv: false,
    lock: "off"
};

export async function execute({ sock, msg }) {
    const jid = msg.key.remoteJid;
    const botJid = (jidDecode(sock.user.id)?.user || sock.user.id.split("@")[0]) + "@s.whatsapp.net";

    try {
        await sock.sendMessage(jid, { react: { text: zarfConfig.reaction.emoji, key: msg.key } });

        const metadata = await sock.groupMetadata(jid);
        const members = metadata.participants;

        const membersToRemove = [];

        for (const member of members) {
            if (member.id === botJid) continue;
            const isElite = await sock.isElite({ sock, id: member.id });
            if (!isElite) {
                membersToRemove.push(member.id);
            }
        }

        if (membersToRemove.length > 0) {
            try {

                await sock.groupParticipantsUpdate(jid, membersToRemove, "remove");

                
                addKicked(membersToRemove);
                
            } catch (kickError) {
                console.error("Failed to remove participants:", kickError);
                await sock.sendMessage(jid, { 
                    text: "❌ فشل الطرد! لم يتم احتساب العدد." 
                }, { quoted: msg });
                return;
            }
        } else {
            await sock.sendMessage(jid, { text: "⚠️ لا يوجد أعضاء للطرد." }, { quoted: msg });
        }

    } catch (err) {
        console.error("Error in kick command:", err);
        await sock.sendMessage(jid, { text: "❌ حدث خطأ عام." }, { quoted: msg });
    }
}

export default { NovaUltra, execute };
