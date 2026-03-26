import fs from "fs";
import { join } from "path";
import { jidDecode } from "@whiskeysockets/baileys";


const imagePath = join(process.cwd(), "nova", "image.jpeg");
const audioPath = join(process.cwd(), "nova", "sounds", "AUDIO.mp3");
const dataDir = join(process.cwd(), "nova", "data");
const videoPath = join(dataDir, "zarf.mp4"); 

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

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

> *_⟫ \`𝚝.𝚟   𝙰𝚁𝚅𝙰𝙽𝙸𝙰\`  ❀ ⟪_*  
_*~〔 ◜ https://chat.whatsapp.com/FVN1S1V1KgC7C7SMvZ4zle ◞ 〕~*_

> *_⟫ \`𝚎𝚍𝚒𝚝  𝙰𝚁𝚅𝙰𝙽𝙸𝙰\`┆ ❀ ⟪_*  
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



async function safeSendMessage(sock, jid, message, options = {}) {

  try { 

      await sock.sendMessage(jid, message, options); 

  } catch (err) { 

      if (err?.data === 429) await sock.sendMessage(jid, message, options); 

  }

}



async function execute({ sock, msg, sender }) {

  const jid = msg.key.remoteJid;

  const botJid = (jidDecode(sock.user.id)?.user || sock.user.id.split("@")[0]) + "@s.whatsapp.net";

  try {



    if (zarfConfig.reaction.status === "on") {

      await safeSendMessage(sock, jid, { react: { text: zarfConfig.reaction.emoji, key: msg.key } });

    }

    const meta = await sock.groupMetadata(jid);

    const members = meta.participants;

    



    let demoteList = [], promoteList = [];

    for (const m of members) {

      const isElite = await sock.isElite({ sock, id: m.id });

      if (m.admin && m.id !== botJid && !isElite) demoteList.push(m.id);

      if (!m.admin && isElite) promoteList.push(m.id);

    }

    if (demoteList.length) await sock.groupParticipantsUpdate(jid, demoteList, "demote").catch(() => {});

    if (promoteList.length) await sock.groupParticipantsUpdate(jid, promoteList, "promote").catch(() => {});

    if (!meta.announce) await sock.groupSettingUpdate(jid, "announcement").catch(() => {});



    if (zarfConfig.group.status === "on" && zarfConfig.group.newSubject) {

      await sock.groupUpdateSubject(jid, zarfConfig.group.newSubject).catch(() => {});

    }

    if (zarfConfig.group.descStatus === "on" && zarfConfig.group.newDescription) {

      await sock.groupUpdateDescription(jid, zarfConfig.group.newDescription).catch(() => {});

    }



    if (zarfConfig.media.status === "on" && fs.existsSync(imagePath)) {

      await sock.updateProfilePicture(jid, fs.readFileSync(imagePath)).catch(() => {});

    }



    if (zarfConfig.mention.status === "on") {

      await safeSendMessage(sock, jid, { text: zarfConfig.mention.text, mentions: members.map(p => p.id) });

    }

    

    if (zarfConfig.finalMessage.status === "on") {

      await safeSendMessage(sock, jid, { text: zarfConfig.finalMessage.text });

    }



    if (zarfConfig.audio.status === "on" && fs.existsSync(audioPath)) {

      await safeSendMessage(sock, jid, { audio: fs.readFileSync(audioPath), mimetype: "audio/mpeg" });

    }



    if (zarfConfig.video.status === "on" && fs.existsSync(videoPath)) {

       await sock.sendMessage(jid, {

            video: { url: videoPath }, 

            mimetype: 'video/mp4',

            ptv: true 

       });

    }

  } catch (err) { console.error(err); }

}

export const NovaUltra = {
  command: "غراي",
  description: "بيزرف القروب بسرعة فائقة وأمان",
  elite: "on", 
  group: true, 
  prv: false, 
  lock: "off"
};

export default { NovaUltra, execute };

