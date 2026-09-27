import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { prompts, answers } from './cards.js';
import { mostLikelyPrompts } from './most-likely.js';

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });
const rooms = new Map();
const DURATION = 30000;
const JUDGE_DURATION = 60000;
const RESULT_DURATION = 11000;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const shuffle = (items) => [...items].sort(() => Math.random() - .5);
const id = () => randomBytes(18).toString('hex');
const code = () => Array.from(randomBytes(5), b => alphabet[b % alphabet.length]).join('');
const reply = (ack, data) => typeof ack === 'function' && ack(data);
const connected = (room) => room.players.filter(p => p.socketId);
const findPlayer = (room, socket) => room.players.find(p => p.socketId === socket.id);
const clearTimer = (room) => { if (room.timer) clearTimeout(room.timer); room.timer = null; };

function publicState(room, player) {
  return {
    code: room.code, phase: room.phase, mode:room.mode, hostId: room.hostId, playerId: player.id,
    players: room.players.map(p => ({ id:p.id, name:p.name, score:p.score, connected:!!p.socketId, submitted:room.mode === 'mostLikely' ? room.votes.has(p.id) : room.plays.has(p.id) })),
    hand: room.mode === 'cards' ? player.hand.map(i => ({ id:i, text:answers[i] })) : [],
    judgeId:room.judgeId, prompt:room.prompt, round:room.round, totalRounds:room.totalRounds,
    endsAt:room.endsAt, cards: room.phase === 'judging' || room.phase === 'result' ? room.shownCards.map(c => ({key:c.key, text:c.text, ...(room.phase === 'result' ? {playerId:c.playerId}: {})})) : [],
    winnerId:room.phase === 'result' || room.phase === 'ended' ? room.winnerId : null,
    winnerIds:room.phase === 'result' ? room.winnerIds : [],
    winningCard:room.phase === 'result' ? room.winningCard : null,
    voteResults:room.phase === 'result' ? room.voteResults : [],
    history:room.phase === 'ended' ? room.history : [],
    canReveal:room.phase === 'result' || room.phase === 'ended'
  };
}
function emitRoom(room) {
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('state', publicState(room,p));
}
function draw(room, player) {
  if (player.hand.length >= 5) return;
  const held = new Set(room.players.flatMap(p => p.hand));
  const available = answers.map((_,i) => i).filter(i => !held.has(i) && !room.deck.includes(i));
  if (!room.deck.length) room.deck = shuffle(available);
  while (player.hand.length < 5 && room.deck.length) player.hand.push(room.deck.pop());
}
function setDeadline(room, ms, fn) {
  clearTimer(room); room.endsAt = Date.now()+ms;
  room.timer = setTimeout(() => { room.timer=null; fn(room); }, ms);
}
function newRound(room) {
  if (room.round >= room.totalRounds || connected(room).length < 3) {
    room.phase='ended'; room.endsAt=null; room.endedAt=Date.now(); room.winnerId=null; clearTimer(room); emitRoom(room); return;
  }
  if (room.mode === 'mostLikely') {
    room.round++;
    room.judgeId=null;
    room.prompt=room.votePrompts.pop();
    if (!room.votePrompts.length) room.votePrompts=shuffle(mostLikelyPrompts.filter(q => q !== room.prompt));
    room.votes.clear(); room.voteResults=[]; room.winnerId=null; room.winnerIds=[]; room.winningCard=null; room.shownCards=[];
    room.phase='voting';
    setDeadline(room,DURATION,finishVoting);
    emitRoom(room);
    return;
  }
  const active = connected(room);
  let index = room.nextJudgeIndex % room.players.length;
  while (!room.players[index].socketId) index=(index+1)%room.players.length;
  room.judgeId=room.players[index].id;
  room.nextJudgeIndex=(index+1)%room.players.length;
  room.round++;
  room.prompt = room.prompts.pop();
  if (!room.prompts.length) room.prompts = shuffle(prompts.filter(q => q !== room.prompt));
  room.plays.clear(); room.shownCards=[]; room.winnerId=null; room.winnerIds=[]; room.winningCard=null; room.voteResults=[];
  room.phase='answering';
  for (const p of active) draw(room,p);
  setDeadline(room,DURATION, finishAnswering);
  emitRoom(room);
}
function finishAnswering(room) {
  if (room.phase !== 'answering') return;
  for (const p of connected(room)) {
    if (p.id === room.judgeId || room.plays.has(p.id)) continue;
    if (p.hand.length) room.plays.set(p.id,p.hand[Math.floor(Math.random()*p.hand.length)]);
  }
  room.shownCards = shuffle([...room.plays].map(([playerId, cardIndex]) => ({ key:id(), playerId, cardIndex, text:answers[cardIndex] })));
  room.phase='judging';
  if (room.shownCards.length === 0) { room.phase='ended'; room.endsAt=null; room.endedAt=Date.now(); emitRoom(room); return; }
  setDeadline(room,JUDGE_DURATION, r => selectWinner(r, r.shownCards[Math.floor(Math.random()*r.shownCards.length)].key));
  emitRoom(room);
}
function selectWinner(room, key) {
  if (room.phase !== 'judging') return false;
  const chosen=room.shownCards.find(c => c.key === key);
  if (!chosen) return false;
  room.winnerId=chosen.playerId;
  room.winnerIds=[chosen.playerId];
  room.winningCard=chosen.text;
  room.players.find(p => p.id === chosen.playerId).score += 2;
  room.history.push({ round:room.round, prompt:room.prompt, winnerId:chosen.playerId, answer:chosen.text });
  for (const [playerId, cardIndex] of room.plays) {
    const p=room.players.find(x => x.id === playerId);
    if (p) p.hand=p.hand.filter(i => i !== cardIndex);
  }
  room.phase='result';
  setDeadline(room,RESULT_DURATION,newRound);
  emitRoom(room);
  return true;
}
function finishVoting(room) {
  if (room.phase !== 'voting') return;
  const active=connected(room);
  const activeIds=new Set(active.map(p => p.id));
  for (const voter of active) {
    const existingTarget=room.votes.get(voter.id);
    if (activeIds.has(existingTarget) && existingTarget !== voter.id) continue;
    const options=active.filter(target => target.id !== voter.id);
    if (options.length) room.votes.set(voter.id,options[Math.floor(Math.random()*options.length)].id);
  }
  const counts=new Map(active.map(p => [p.id,0]));
  for (const [voterId,targetId] of room.votes) {
    if (activeIds.has(voterId) && activeIds.has(targetId) && voterId !== targetId) counts.set(targetId,(counts.get(targetId) || 0)+1);
  }
  room.voteResults=[...counts].map(([playerId,votes]) => ({playerId,votes})).sort((a,b)=>b.votes-a.votes);
  const high=Math.max(...room.voteResults.map(result => result.votes));
  room.winnerIds=room.voteResults.filter(result => result.votes === high).map(result => result.playerId);
  room.winnerId=room.winnerIds[0] || null;
  for (const result of room.voteResults) room.players.find(p => p.id === result.playerId).score += result.votes;
  room.history.push({round:room.round,prompt:room.prompt,winnerIds:room.winnerIds,votes:room.voteResults});
  room.phase='result';
  setDeadline(room,RESULT_DURATION,newRound);
  emitRoom(room);
}
function fail(ack, message) { reply(ack,{ok:false,error:message}); }
function validName(input) { return typeof input === 'string' && input.trim().length >= 1 && input.trim().length <= 20; }
function join(socket, room, name, token, ack) {
  if (room.phase !== 'lobby' && !room.players.some(p => p.token === token)) return fail(ack,'Esta partida ya comenzó.');
  let p=room.players.find(p => p.token === token);
  if (!p) {
    if (!validName(name)) return fail(ack,'Elegí un nombre de hasta 20 caracteres.');
    if (room.players.length >= 10) return fail(ack,'La sala está llena (máximo 10 jugadores).');
    const clean=name.trim();
    if (room.players.some(p => p.name.toLowerCase() === clean.toLowerCase())) return fail(ack,'Ese nombre ya está en uso.');
    p={id:id(),token:id(),name:clean,score:0,hand:[],socketId:null};
    room.players.push(p);
  }
  if (p.socketId && p.socketId !== socket.id) io.sockets.sockets.get(p.socketId)?.disconnect(true);
  p.socketId=socket.id; socket.data.room=room.code; socket.data.player=p.id;
  socket.join(room.code);
  reply(ack,{ok:true,token:p.token,code:room.code});
  emitRoom(room);
}
io.on('connection', socket => {
  socket.on('create', (data={}, ack) => {
    if (socket.data.room) return fail(ack,'Ya estás en una sala.');
    if (!validName(data.name)) return fail(ack,'Elegí un nombre de hasta 20 caracteres.');
    let key; do { key=code(); } while(rooms.has(key));
    const room={code:key,players:[],hostId:null,phase:'lobby',mode:'cards',round:0,totalRounds:8,nextJudgeIndex:0,judgeId:null,prompt:null,prompts:shuffle(prompts),votePrompts:shuffle(mostLikelyPrompts),deck:shuffle(answers.map((_,i)=>i)),plays:new Map(),votes:new Map(),shownCards:[],voteResults:[],history:[],winnerId:null,winnerIds:[],winningCard:null,endsAt:null,timer:null};
    rooms.set(key,room);
    join(socket,room,data.name,null,ack);
    room.hostId=room.players[0].id;
    emitRoom(room);
  });
  socket.on('join', (data={}, ack) => {
    if (socket.data.room) return fail(ack,'Ya estás en una sala.');
    const room=rooms.get(String(data.code || '').toUpperCase().trim());
    if (!room) return fail(ack,'No encontramos esa sala. Revisá el código.');
    join(socket,room,data.name,data.token,ack);
  });
  socket.on('start', (data={}, ack) => {
    const room=rooms.get(socket.data.room); const p=room && findPlayer(room,socket);
    if (!p || p.id !== room.hostId || room.phase !== 'lobby') return fail(ack,'Solo quien creó la sala puede empezar.');
    if (connected(room).length < 3) return fail(ack,'Necesitás al menos 3 jugadores.');
    if (![8,12,16].includes(data.rounds) || (room.mode === 'cards' && data.rounds < connected(room).length)) return fail(ack,room.mode === 'cards' ? 'Elegí suficientes rondas para que todos sean jueces.' : 'Elegí una cantidad válida de rondas.');
    room.totalRounds=data.rounds;
    if (room.mode === 'cards') for (const player of room.players) draw(room,player);
    reply(ack,{ok:true}); newRound(room);
  });
  socket.on('mode', (data={}, ack) => {
    const room=rooms.get(socket.data.room); const p=room && findPlayer(room,socket);
    if (!p || p.id !== room.hostId || room.phase !== 'lobby') return fail(ack,'Solo quien creó la sala puede cambiar la modalidad.');
    if (!['cards','mostLikely'].includes(data.mode)) return fail(ack,'Esa modalidad no existe.');
    room.mode=data.mode; reply(ack,{ok:true}); emitRoom(room);
  });
  socket.on('play', (data={}, ack) => {
    const room=rooms.get(socket.data.room), p=room && findPlayer(room,socket);
    if (!p || room.phase !== 'answering' || p.id === room.judgeId || room.plays.has(p.id) || !p.hand.includes(data.cardId)) return fail(ack,'No se pudo jugar esa carta.');
    room.plays.set(p.id,data.cardId); reply(ack,{ok:true});
    if (connected(room).filter(x => x.id !== room.judgeId).every(x => room.plays.has(x.id))) finishAnswering(room);
    else emitRoom(room);
  });
  socket.on('pick', (data={}, ack) => {
    const room=rooms.get(socket.data.room), p=room && findPlayer(room,socket);
    if (!p || p.id !== room.judgeId || !selectWinner(room,data.key)) return fail(ack,'Solo el juez puede elegir una respuesta.');
    reply(ack,{ok:true});
  });
  socket.on('vote', (data={}, ack) => {
    const room=rooms.get(socket.data.room), p=room && findPlayer(room,socket);
    const target=room?.players.find(player => player.id === data.playerId && player.socketId);
    if (!p || room.phase !== 'voting' || room.votes.has(p.id) || !target || target.id === p.id) return fail(ack,'No se pudo registrar ese voto.');
    room.votes.set(p.id,target.id); reply(ack,{ok:true});
    if (connected(room).every(player => room.votes.has(player.id))) finishVoting(room);
    else emitRoom(room);
  });
  socket.on('next', (_,ack) => {
    const room=rooms.get(socket.data.room), p=room && findPlayer(room,socket);
    if (!p || p.id !== room.hostId || room.phase !== 'result') return fail(ack,'Esperá el resultado.');
    reply(ack,{ok:true}); newRound(room);
  });
  socket.on('leave', (_,ack) => { reply(ack,{ok:true}); socket.disconnect(true); });
  socket.on('disconnect', () => {
    const room=rooms.get(socket.data.room); if (!room) return;
    const p=room.players.find(x => x.id === socket.data.player);
    if (!p || p.socketId !== socket.id) return;
    p.socketId=null;
    if (room.phase === 'lobby') {
      room.players=room.players.filter(x => x.id !== p.id);
      if (room.hostId === p.id) room.hostId=room.players[0]?.id ?? null;
    } else if (room.hostId===p.id) room.hostId=connected(room)[0]?.id ?? null;
    if (!room.players.length) { clearTimer(room); rooms.delete(room.code); return; }
    if (room.phase === 'answering' && connected(room).filter(x=>x.id!==room.judgeId).every(x=>room.plays.has(x.id))) finishAnswering(room);
    else if (room.phase === 'voting' && connected(room).every(x=>room.votes.has(x.id))) finishVoting(room);
    else if (room.phase === 'judging' && p.id === room.judgeId) selectWinner(room,room.shownCards[Math.floor(Math.random()*room.shownCards.length)].key);
    else emitRoom(room);
  });
});
setInterval(() => {
  for (const room of rooms.values()) if (!connected(room).length || (room.phase === 'ended' && Date.now()-(room.endedAt ?? Date.now())>3600000)) { clearTimer(room); rooms.delete(room.code); }
},60000).unref();
const dirname=path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(dirname,'../dist')));
  app.get('*',(req,res)=>res.sendFile(path.join(dirname,'../dist/index.html')));
}
const PORT=Number(process.env.PORT)||3001;
http.listen(PORT,'0.0.0.0',()=>console.log(`El más bizarro listo en el puerto ${PORT}`));
