// Lista los canales y grupos donde se ha añadido el bot, con su número de chat (sirve también para los privados).
// Telegram guarda estos avisos 24 horas: ejecútalo después de hacer administrador al bot en los canales.
// Uso (PowerShell):  $env:TELEGRAM_BOT_TOKEN = '...'; node scripts/telegram-chats.mjs
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Falta la variable de entorno TELEGRAM_BOT_TOKEN');
const api = async (m, p = {}) => {
  const r = await (await fetch(`https://api.telegram.org/bot${token}/${m}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p)
  })).json();
  if (!r.ok) throw new Error(`${m}: ${r.description}`);
  return r.result;
};
const yo = await api('getMe');
console.log(`Bot: @${yo.username}\n`);
const chats = new Map();
for (const u of await api('getUpdates', { allowed_updates: ['my_chat_member', 'channel_post', 'message'] })) {
  const c = (u.my_chat_member || u.channel_post || u.message)?.chat;
  const estado = u.my_chat_member?.new_chat_member?.status;
  if (c && c.type !== 'private') chats.set(c.id, { ...c, estado: estado || chats.get(c.id)?.estado || '' });
}
if (!chats.size) console.log('No hay avisos. Quita y vuelve a poner al bot como administrador en algún canal y repite.');
for (const c of chats.values()) {
  console.log(`${c.type.padEnd(10)} ${String(c.id).padEnd(16)} ${c.username ? '@' + c.username : '(privado)'}  ${c.title}  ${c.estado}`);
}
