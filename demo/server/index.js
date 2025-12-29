const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
let wasmEngine;
try {
  wasmEngine = require('../../engine-rust/pkg');
} catch (error) {
  throw new Error(
    `Failed to load engine-rust WASM. Build it first with "wasm-pack build --target nodejs" in engine-rust. Original error: ${error.message}`
  );
}
const {
  createBattleState,
  stepBattle,
  isBattleOver,
  getBestMoveMinimax,
  getBestMoveMCTS,
  createCreature,
} = wasmEngine;
const { gen1Species } = require("../../engine/data/species/gen1"); // For team gen
const { moves: moveData } = require("../../engine/data/moves");
const { learnsets } = require("../../engine/data/learnsets");

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/api/demo-data', (req, res) => {
  const species = Object.values(gen1Species).map(spec => ({
    id: spec.id,
    name: spec.name,
    types: spec.type || spec.types || [],
    abilities: spec.abilities || []
  }));
  const moves = Object.values(moveData).map(move => ({
    id: move.id,
    name: move.name || move.id,
    type: move.type || null,
    pp: typeof move.pp === 'number' ? move.pp : null
  }));
  const items = [
    { id: "none", name: "なし" },
    { id: "life_orb", name: "いのちのたま" },
    { id: "choice_band", name: "こだわりハチマキ" },
    { id: "choice_specs", name: "こだわりメガネ" },
    { id: "choice_scarf", name: "こだわりスカーフ" },
    { id: "leftovers", name: "たべのこし" },
    { id: "sitrus_berry", name: "オボンのみ" },
    { id: "lum_berry", name: "ラムのみ" },
    { id: "focus_sash", name: "きあいのタスキ" },
    { id: "assault_vest", name: "とつげきチョッキ" },
    { id: "heavy_duty_boots", name: "あつぞこブーツ" },
  ];
  res.json({ species, moves, learnsets, items });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3020;

// Simple in-memory room storage
const rooms = {};

// Helper to generate a random team
function generateRandomTeam() {
    const speciesList = Object.keys(gen1Species);
    const team = [];
    for(let i=0; i<3; i++) {
        const id = speciesList[Math.floor(Math.random() * speciesList.length)];
        const spec = gen1Species[id];
        team.push(buildCreatureFromSpec(id, spec, null));
    }
    return team;
}

function buildCreatureFromSpec(id, spec, requestedMoves, ability, item) {
    const moveIds = Object.keys(moveData);
    const allowedMoves = (learnsets[id] && learnsets[id].length) ? learnsets[id] : (spec.moves || []);
    const allowedSet = new Set(allowedMoves);
    const filteredMoves = Array.isArray(requestedMoves)
        ? requestedMoves.filter(moveId => allowedSet.has(moveId) && moveIds.includes(moveId))
        : [];
    const fallbackMoves = allowedMoves.filter(moveId => moveIds.includes(moveId)).slice(0, 4);
    const moves = filteredMoves.length ? filteredMoves.slice(0, 4) : fallbackMoves;
    
    const selectedAbility = (spec.abilities || []).includes(ability) ? ability : spec.abilities?.[0] || "none";

    try {
        return createCreature(id, { moves, ability: selectedAbility, item: item || null });
    } catch (error) {
        return createCreature(id, { moves: fallbackMoves, ability: selectedAbility, item: item || null });
    }
}

function buildTeamFromClient(teamSpec) {
    if (!Array.isArray(teamSpec) || teamSpec.length === 0) return null;
    const team = [];
    for (let i = 0; i < Math.min(teamSpec.length, 3); i++) {
        const slot = teamSpec[i];
        const speciesId = slot?.speciesId;
        const spec = gen1Species[speciesId];
        if (!spec) return null;
        team.push(buildCreatureFromSpec(speciesId, spec, slot?.moves, slot?.ability, slot?.item));
    }
    if (team.length < 3) {
        const speciesList = Object.keys(gen1Species);
        for (let i = team.length; i < 3; i++) {
            const id = speciesList[Math.floor(Math.random() * speciesList.length)];
            const spec = gen1Species[id];
            team.push(buildCreatureFromSpec(id, spec, null, null, null));
        }
    }
    return team;
}

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('join_room', ({ roomId, mode, playerName, team }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      
      if (!rooms[roomId]) {
          rooms[roomId] = {
              id: roomId,
              mode, // "pvp", "pve_minimax", "pve_mcts"
              players: [],
              battleState: null,
              pendingActions: {}
          };
      }
      
      const room = rooms[roomId];
      
      // Prevent joining full room
      if (room.players.length >= 2) {
          socket.emit('error', { message: "Room is full" });
          return;
      }
      
      const selectedTeam = buildTeamFromClient(team) || generateRandomTeam();
      const player = {
          id: socket.id,
          name: playerName || `Player ${room.players.length + 1}`,
          team: selectedTeam,
          socket
      };
      
      room.players.push(player);
      
      // If PvE, add AI immediately
      if (mode.startsWith("pve") && room.players.length === 1) {
          const aiPlayer = {
              id: "ai_bot",
              name: "AI Bot",
              team: generateRandomTeam(),
              isAi: true,
              aiType: mode === "pve_mcts" ? "mcts" : "minimax"
          };
          room.players.push(aiPlayer);
      }
      
      // Start Battle if 2 players
      if (room.players.length === 2) {
          startBattle(roomId);
      } else {
          socket.emit('waiting', { message: "Waiting for opponent..." });
      }
  });

  socket.on('submit_action', ({ roomId, action }) => {
      const room = rooms[roomId];
      if (!room || !room.battleState) return;
      
      // Validate turn
      if (room.pendingActions[socket.id]) return; // Already submitted

      const validation = validateAction(room.battleState, socket.id, action);
      if (!validation.ok) {
          socket.emit('action_error', { message: validation.message });
          return;
      }
      
      room.pendingActions[socket.id] = { ...action, playerId: socket.id };
      
      checkTurnResolution(roomId);
  });

  socket.on('leave_room', ({ roomId }) => {
      handlePlayerExit(socket, roomId || socket.data.roomId);
  });

  socket.on('disconnect', () => {
      console.log('user disconnected:', socket.id);
      handlePlayerExit(socket, socket.data.roomId);
  });
});

function startBattle(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    
    // Initialize Engine State
    const enginePlayers = room.players.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team
    }));
    
    room.battleState = createBattleState(enginePlayers);
    room.pendingActions = {};
    
    // Notify clients
    broadcastState(roomId);
    
    // If AI is present, it might need to act if it's somehow first? 
    // Actually engine is simultaneous turns usually.
    // If we want AI to act, we handle it in checkTurnResolution or right here if we need to pre-calc.
    // But usually we wait for human input, then calc AI move, then resolve.
}

function broadcastState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (resolveNoSwitchDefeat(roomId)) return;
    
    // Send sanitized state to each player (hide opponent moves? logic is engine side usually)
    // For now, send full state for debugging/demo
    room.players.forEach(p => {
        if (!p.isAi && p.socket) {
            p.socket.emit('battle_update', {
                state: room.battleState,
                myId: p.id
            });
        }
    });
}

function checkTurnResolution(roomId) {
    const room = rooms[roomId];
    if (!room || !room.battleState) return;

    if (resolveNoSwitchDefeat(roomId)) return;
    
    const humanPlayers = room.players.filter(p => !p.isAi);
    const aiPlayer = room.players.find(p => p.isAi);
    
    // Check if all humans submitted
    const allHumansSubmitted = humanPlayers.every(p => room.pendingActions[p.id]);
    
    if (allHumansSubmitted) {
        // Generate AI move if needed
        if (aiPlayer) {
            let aiAction;
            const aiState = room.battleState.players.find(p => p.id === aiPlayer.id);
            const aiActive = aiState?.team?.[aiState?.activeSlot ?? 0];
            const needsSwitch = aiActive && (aiActive.hp <= 0 || (aiActive.statuses || []).some(s => s.id === 'pending_switch'));
            if (needsSwitch && aiState) {
                const nextSlot = aiState.team.findIndex((mon, idx) => idx !== aiState.activeSlot && mon.hp > 0);
                if (nextSlot >= 0) {
                    aiAction = { type: "switch", playerId: aiPlayer.id, slot: nextSlot };
                }
            }
            // Simple timeout to simulate "thinking" not blocking event loop too much
            // In real app, offload to worker
            if (!aiAction) {
                if (aiPlayer.aiType === "mcts") {
                    aiAction = getBestMoveMCTS(room.battleState, aiPlayer.id, 100);
                } else {
                    aiAction = getBestMoveMinimax(room.battleState, aiPlayer.id, 2);
                }
            }
            
            if (!aiAction) aiAction = { type: "move", playerId: aiPlayer.id }; // Should switch or struggle
            
            room.pendingActions[aiPlayer.id] = aiAction;
        }
        
        // Execute Turn
        const actions = Object.values(room.pendingActions);
        const nextState = stepBattle(room.battleState, actions);
        room.battleState = nextState;
        room.pendingActions = {};
        
        if (resolveNoSwitchDefeat(roomId)) return;
        broadcastState(roomId);
        
        if (isBattleOver(nextState)) {
             room.players.forEach(p => {
                if (!p.isAi && p.socket) {
                    p.socket.emit('battle_end', { winner: getWinner(nextState) });
                }
            });
            delete rooms[roomId]; // Cleanup
        }
    }
}

function handlePlayerExit(socket, roomId) {
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    const leavingId = socket.id;
    const remaining = room.players.find(p => p.id !== leavingId);
    const winnerId = remaining ? remaining.id : null;

    room.players = room.players.filter(p => p.id !== leavingId);
    socket.leave(roomId);
    socket.data.roomId = null;

    if (winnerId) {
        room.players.forEach(p => {
            if (!p.isAi && p.socket) {
                p.socket.emit('battle_end', { winner: winnerId });
            }
        });
    }

    delete rooms[roomId];
}

function getWinner(state) {
    for(const p of state.players) {
        if(p.team.some(c => c.hp > 0)) return p.id;
    }
    return null;
}

function validateAction(state, playerId, action) {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return { ok: false, message: 'プレイヤーが見つかりません。' };
    const active = player.team[player.activeSlot];
    const hasPendingSwitch = active?.statuses?.some(s => s.id === 'pending_switch');
    const isFainted = !active || active.hp <= 0;
    const needsSwitch = hasPendingSwitch || isFainted;
    const hasSwitchOption = player.team.some((mon, idx) => idx !== player.activeSlot && mon.hp > 0);

    if (needsSwitch && !hasSwitchOption) {
        return { ok: false, message: '交代できるポケモンがいません。' };
    }

    if (needsSwitch) {
        if (action.type !== 'switch') {
            return { ok: false, message: '交代が必要です。交代先を選んでください。' };
        }
    }

    if (action.type === 'switch') {
        const slot = action.slot;
        if (typeof slot !== 'number') return { ok: false, message: '交代先が不正です。' };
        if (slot < 0 || slot >= player.team.length) return { ok: false, message: '交代先が不正です。' };
        if (slot === player.activeSlot) return { ok: false, message: '同じポケモンには交代できません。' };
        if (player.team[slot].hp <= 0) return { ok: false, message: 'ひんしのポケモンには交代できません。' };
        return { ok: true };
    }

    if (action.type === 'move') {
        const moveId = action.moveId;
        if (!moveId || !active?.moves?.includes(moveId)) {
            return { ok: false, message: '使用できない技です。' };
        }
        const remaining = active.movePp?.[moveId];
        if (typeof remaining === 'number' && remaining <= 0) {
            return { ok: false, message: 'その技のPPが足りません。' };
        }
        return { ok: true };
    }

    if (action.type === 'use_item') {
        const itemId = getHeldItemId(active);
        if (!itemId) return { ok: false, message: '使用できる持ち物がありません。' };
        if (!isUsableItemId(itemId)) return { ok: false, message: 'その持ち物は使用できません。' };
        return { ok: true };
    }

    return { ok: false, message: '不正な操作です。' };
}

function needsSwitch(player) {
    const active = player.team[player.activeSlot];
    return !active || active.hp <= 0 || (active.statuses || []).some(s => s.id === 'pending_switch');
}

function hasAvailableSwitch(player) {
    return player.team.some((mon, idx) => idx !== player.activeSlot && mon.hp > 0);
}

function resolveNoSwitchDefeat(roomId) {
    const room = rooms[roomId];
    if (!room || !room.battleState) return false;
    const loser = room.battleState.players.find(p => needsSwitch(p) && !hasAvailableSwitch(p));
    if (!loser) return false;
    const winnerId = room.battleState.players.find(p => p.id !== loser.id)?.id ?? null;
    room.players.forEach(p => {
        if (!p.isAi && p.socket) {
            p.socket.emit('battle_end', { winner: winnerId });
        }
    });
    delete rooms[roomId];
    return true;
}

function getHeldItemId(creature) {
    if (!creature) return null;
    if (creature.item) return creature.item;
    const itemStatus = creature.statuses?.find(s => s.id === 'item' || s.id === 'berry');
    if (!itemStatus) return null;
    return itemStatus.data?.itemId ?? itemStatus.id ?? null;
}

function isUsableItemId(itemId) {
    if (!itemId) return false;
    return itemId.includes('berry');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
