const socket = io();
let currentRoom = null;
let myId = null;
let gameState = null;
let currentMode = null;
let waitingForTurnResolution = false;
let currentActionTab = 'move';
let demoData = null;
let moveNameMap = new Map();
let moveInfoMap = new Map();
let hasLeftRoom = false;
let lastLogLength = 0;
let logAutoScrollLocked = false;

function join(mode) {
    const roomId = document.getElementById('roomId').value;
    const playerName = document.getElementById('playerName').value;
    const team = collectTeamSelection();
    currentRoom = roomId;
    currentMode = mode;
    setLobbyError('');
    socket.emit('join_room', { roomId, mode, playerName, team });
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('battle').classList.remove('hidden');
    setBattleStatus('対戦開始を待っています...');
    updateHeaderLabels();
    hasLeftRoom = false;
}

socket.on('battle_update', (data) => {
    gameState = data.state;
    myId = data.myId;
    waitingForTurnResolution = false;
    render();
});

socket.on('battle_end', (data) => {
    if (hasLeftRoom) return;
    const modal = document.getElementById('switch-modal');
    if (modal) modal.classList.add('hidden');
    logAutoScrollLocked = false;
    addLog(`バトル終了！ 勝者: ${data.winner}`);
    setBattleStatus('対戦終了');
});

socket.on('waiting', (data) => {
    addLog(data.message);
    setBattleStatus('対戦相手を待っています...');
});

socket.on('error', (data) => {
    const message = data?.message || 'エラーが発生しました。';
    setLobbyError(message);
    document.getElementById('battle').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
});

socket.on('action_error', (data) => {
    const message = data?.message || '不正な操作です。';
    window.alert(message);
    waitingForTurnResolution = false;
    setBattleStatus('入力待ち');
    setActionEnabled(true);
});

function render() {
    if (!gameState) return;
    const me = gameState.players.find(p => p.id === myId);
    const opp = gameState.players.find(p => p.id !== myId);
    
    const myActive = me.team[me.activeSlot];
    const oppActive = opp.team[opp.activeSlot];
    updateHeaderLabels(me, opp);
    
    // Handle forced switch
    const needsToSwitch = myActive.statuses.some(s => s.id === 'pending_switch') || myActive.hp <= 0;
    if (needsToSwitch) {
        currentActionTab = 'switch';
    }
    const hasSwitchOption = me.team.some((mon, idx) => idx !== me.activeSlot && mon.hp > 0);
    setBattleStatus(needsToSwitch ? (hasSwitchOption ? '交代先を選んでください。' : '交代できるポケモンがいません。') : '入力待ち');
    updateForceSwitchModal(needsToSwitch, me);
    updateActionTabUI();
    const tabMove = document.getElementById('tab-move');
    if (needsToSwitch) {
        tabMove.disabled = true;
        tabMove.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
        tabMove.disabled = false;
        tabMove.classList.remove('opacity-60', 'cursor-not-allowed');
    }

    // Update Player UI
    document.getElementById('my-name').innerText = `${myActive.name} (#${me.activeSlot + 1})`;
    document.getElementById('my-hp-text').innerText = `${myActive.hp} / ${myActive.maxHp}`;
    document.getElementById('my-types').innerText = formatTypes(myActive);
    document.getElementById('my-ability-item').innerText = formatAbilityItem(myActive);
    document.getElementById('my-status').innerText = formatStatuses(myActive);
    updateHpBar('my-hp-bar', myActive.hp, myActive.maxHp);

    // Update Opponent UI
    document.getElementById('opp-name').innerText = `${oppActive.name} (#${opp.activeSlot + 1})`;
    document.getElementById('opp-hp-text').innerText = `${oppActive.hp} / ${oppActive.maxHp}`;
    document.getElementById('opp-types').innerText = formatTypes(oppActive);
    document.getElementById('opp-ability-item').innerText = formatAbilityItem(oppActive);
    document.getElementById('opp-status').innerText = formatStatuses(oppActive);
    updateHpBar('opp-hp-bar', oppActive.hp, oppActive.maxHp);

    // Render Moves
    const moveGrid = document.getElementById('move-grid');
    moveGrid.innerHTML = '';
    myActive.moves.forEach(moveId => {
        const btn = document.createElement('button');
        const moveInfo = moveInfoMap.get(moveId);
        const typeLabel = formatLabel(moveInfo?.type || '');
        const ppLabel = formatPpLabel(myActive, moveId, moveInfo);
        const statusBlocked = isMoveBlockedByStatus(myActive, moveId);
        const typeClass = getTypeClass(moveInfo?.type);
        btn.className = `${typeClass} p-3 rounded text-sm font-bold capitalize flex items-center justify-between gap-2`;
        btn.innerHTML = `
            <span>${getMoveLabel(moveId)}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-black/30">${typeLabel || '-'}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-black/30">PP ${ppLabel}</span>
        `;
        btn.onclick = () => submitAction({ type: 'move', moveId });
        btn.disabled = waitingForTurnResolution || needsToSwitch || statusBlocked;
        if (btn.disabled) {
            btn.classList.add('opacity-60', 'cursor-not-allowed');
        }
        moveGrid.appendChild(btn);
    });

    // Render Switches
    const switchGrid = document.getElementById('switch-grid');
    renderSwitchButtons(switchGrid, me, {
        disabled: waitingForTurnResolution || needsToSwitch,
        includeActive: false,
    });

    renderTeamList(me);
    setActionEnabled(!waitingForTurnResolution && !needsToSwitch);
    updateItemButton(myActive, waitingForTurnResolution || needsToSwitch);

    syncLog();
}

function setLobbyError(message) {
    const box = document.getElementById('lobby-error');
    if (!box) return;
    const text = message || '';
    box.textContent = text;
    if (text) {
        box.classList.remove('hidden');
    } else {
        box.classList.add('hidden');
    }
}

function setBattleStatus(text) {
    const el = document.getElementById('battle-status');
    if (el) el.textContent = text || '-';
}

function updateHeaderLabels(me, opp) {
    const roomEl = document.getElementById('room-label');
    if (roomEl) roomEl.textContent = currentRoom || '-';
    const modeEl = document.getElementById('mode-label');
    if (modeEl) modeEl.textContent = formatMode(currentMode);
    const turnEl = document.getElementById('turn-label');
    if (turnEl) turnEl.textContent = gameState ? String(gameState.turn) : '-';
    const playerEl = document.getElementById('player-label');
    if (playerEl) {
        const fallback = document.getElementById('playerName')?.value || '-';
        playerEl.textContent = me?.name || fallback;
    }
    const oppEl = document.getElementById('opponent-label');
    if (oppEl) oppEl.textContent = opp?.name || '-';
}

function addLog(message, options = {}) {
    const logBox = document.getElementById('log');
    if (!logBox) return;
    const line = document.createElement('div');
    line.textContent = message;
    logBox.appendChild(line);
    if (options.autoScroll !== false) {
        scrollLogToBottom();
    }
}

function scrollLogToBottom() {
    const logBox = document.getElementById('log');
    if (!logBox) return;
    logBox.scrollTop = logBox.scrollHeight;
}

function updateHpBar(id, current, max) {
    const bar = document.getElementById(id);
    if (!bar) return;
    const safeMax = Math.max(1, max || 0);
    const ratio = Math.max(0, Math.min(1, current / safeMax));
    bar.style.width = `${Math.round(ratio * 100)}%`;
    bar.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500');
    if (ratio > 0.5) {
        bar.classList.add('bg-green-500');
    } else if (ratio > 0.2) {
        bar.classList.add('bg-yellow-500');
    } else {
        bar.classList.add('bg-red-500');
    }
}

function showActionTab(tab) {
    currentActionTab = tab;
    updateActionTabUI();
}

function setActionEnabled(enabled) {
    const buttons = document.querySelectorAll('#actions button');
    buttons.forEach(btn => {
        if (btn.id === 'tab-move' || btn.id === 'tab-switch') return;
        btn.disabled = !enabled;
        btn.classList.toggle('opacity-60', !enabled);
        btn.classList.toggle('cursor-not-allowed', !enabled);
    });
}

function submitAction(action) {
    if (!currentRoom || waitingForTurnResolution) return;
    waitingForTurnResolution = true;
    setBattleStatus('相手の入力を待っています...');
    setActionEnabled(false);
    socket.emit('submit_action', { roomId: currentRoom, action });
}

function leaveRoom() {
    if (!currentRoom) return;
    hasLeftRoom = true;
    socket.emit('leave_room', { roomId: currentRoom });
    currentRoom = null;
    gameState = null;
    lastLogLength = 0;
    logAutoScrollLocked = false;
    document.getElementById('battle').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    const logBox = document.getElementById('log');
    if (logBox) logBox.innerHTML = '<div>バトル開始を待っています...</div>';
}

function formatTypes(creature) {
    if (!creature?.types?.length) return '-';
    return creature.types.map(formatLabel).join(' / ');
}

function formatStatuses(creature) {
    if (!creature?.statuses?.length) return '';
    return creature.statuses
        .map(status => formatLabel(status.id))
        .filter(Boolean)
        .join(', ');
}

function renderTeamList(me) {
    const list = document.getElementById('team-list');
    if (!list || !me) return;
    list.innerHTML = '';
    me.team.forEach((mon, idx) => {
        const row = document.createElement('div');
        const activeMark = idx === me.activeSlot ? '★ ' : '';
        const statusText = formatStatuses(mon);
        const itemText = formatItemLabel(mon);
        const extras = [statusText, itemText].filter(Boolean).join(' / ');
        row.textContent = `${activeMark}${mon.name} (#${idx + 1}) HP:${mon.hp}/${mon.maxHp}${extras ? ` [${extras}]` : ''}`;
        list.appendChild(row);
    });
}

function formatAbilityItem(creature) {
    const ab = formatLabel(creature.ability || 'none');
    const item = formatLabel(getHeldItemId(creature) || 'none');
    return `特性: ${ab} / 持ち物: ${item}`;
}

function formatPpLabel(creature, moveId, moveInfo) {
    const maxPp = typeof moveInfo?.pp === 'number' ? moveInfo.pp : null;
    const current = creature?.movePp?.[moveId];
    if (current === null) return '-';
    if (typeof maxPp === 'number') {
        const currentVal = typeof current === 'number' ? current : maxPp;
        return `${currentVal}/${maxPp}`;
    }
    return '-';
}

function isMoveBlockedByStatus(creature, moveId) {
    if (!creature) return false;
    const statuses = creature.statuses || [];
    const disabledStatus = statuses.find(s => s.id === 'disable_move');
    if (disabledStatus?.data?.moveId === moveId) return true;
    const encoreStatus = statuses.find(s => s.id === 'encore');
    if (encoreStatus?.data?.moveId && encoreStatus.data.moveId !== moveId) return true;
    const lockStatus = statuses.find(s => s.id === 'lock_move');
    if (lockStatus?.data?.mode === 'force_specific' && lockStatus.data?.moveId) {
        return lockStatus.data.moveId !== moveId;
    }
    if (lockStatus?.data?.mode === 'force_last_move') {
        const lastMove = creature.volatileData?.lastMove;
        if (lastMove && lastMove !== moveId) return true;
    }
    return false;
}

function formatItemLabel(creature) {
    const itemId = getHeldItemId(creature);
    if (!itemId) return '';
    return `持ち物:${formatLabel(itemId)}`;
}

function formatLabel(value) {
    if (!value || value === 'none') return '-';
    return String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMode(mode) {
    if (mode === 'pve_minimax') return 'VS AI (Minimax)';
    if (mode === 'pve_mcts') return 'VS AI (MCTS)';
    if (mode === 'pvp') return '対人戦 (PvP)';
    return mode || '-';
}

function updateActionTabUI() {
    const moveGrid = document.getElementById('move-grid');
    const switchGrid = document.getElementById('switch-grid');
    const tabMove = document.getElementById('tab-move');
    const tabSwitch = document.getElementById('tab-switch');
    if (currentActionTab === 'switch') {
        moveGrid.classList.add('hidden');
        switchGrid.classList.remove('hidden');
        tabMove.classList.remove('bg-blue-700');
        tabMove.classList.add('bg-gray-600');
        tabSwitch.classList.remove('bg-gray-600');
        tabSwitch.classList.add('bg-green-700');
    } else {
        switchGrid.classList.add('hidden');
        moveGrid.classList.remove('hidden');
        tabSwitch.classList.remove('bg-green-700');
        tabSwitch.classList.add('bg-gray-600');
        tabMove.classList.remove('bg-gray-600');
        tabMove.classList.add('bg-blue-700');
    }
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

function updateItemButton(active, disabled) {
    const button = document.getElementById('item-button');
    const wrapper = document.getElementById('item-actions');
    if (!button || !wrapper) return;
    const itemId = getHeldItemId(active);
    const canUse = isUsableItemId(itemId);
    wrapper.classList.toggle('hidden', !canUse);
    if (!canUse) return;
    button.textContent = `${formatLabel(itemId)} を使う`;
    button.onclick = () => submitAction({ type: 'use_item' });
    button.disabled = disabled;
    button.classList.toggle('opacity-60', disabled);
    button.classList.toggle('cursor-not-allowed', disabled);
}

function syncLog() {
    const logBox = document.getElementById('log');
    if (!logBox || !gameState?.log) return;
    if (gameState.log.length < lastLogLength) {
        logBox.innerHTML = '';
        lastLogLength = 0;
    }
    for (let i = lastLogLength; i < gameState.log.length; i += 1) {
        addLog(gameState.log[i], { autoScroll: !logAutoScrollLocked });
    }
    lastLogLength = gameState.log.length;
    if (!logAutoScrollLocked) {
        scrollLogToBottom();
    }
}

function renderSwitchButtons(container, me, { disabled, includeActive }) {
    container.innerHTML = '';
    me.team.forEach((mon, i) => {
        if (!includeActive && i === me.activeSlot) return;
        const btn = document.createElement('button');
        const isDead = mon.hp <= 0;
        btn.className = `${isDead ? 'bg-gray-700' : 'bg-green-700 hover:bg-green-600'} p-3 rounded text-sm font-bold flex justify-between`;
        btn.disabled = isDead || disabled;
        btn.innerHTML = `<span>${mon.name} (#${i + 1})</span> <span>HP: ${mon.hp}/${mon.maxHp}</span>`;
        btn.onclick = () => {
            submitAction({ type: 'switch', slot: i });
        };
        container.appendChild(btn);
    });
}

function updateForceSwitchModal(enabled, me) {
    const modal = document.getElementById('switch-modal');
    const modalGrid = document.getElementById('switch-modal-grid');
    const modalMessage = document.getElementById('switch-modal-message');
    logAutoScrollLocked = enabled;
    if (!modal || !modalGrid || !modalMessage) return;
    if (!enabled) {
        modal.classList.add('hidden');
        scrollLogToBottom();
        return;
    }
    modal.classList.remove('hidden');
    renderSwitchButtons(modalGrid, me, {
        disabled: waitingForTurnResolution,
        includeActive: false,
    });
    const hasChoice = me.team.some((mon, idx) => idx !== me.activeSlot && mon.hp > 0);
    modalMessage.textContent = hasChoice ? '交代先を選んでください。' : '交代できるポケモンがいません。';
    updateModalLog();
}

function updateModalLog() {
    const modalLog = document.getElementById('switch-modal-log');
    if (!modalLog || !gameState?.log) return;
    modalLog.innerHTML = '';
    const recent = gameState.log.slice(-8);
    recent.forEach((msg) => {
        const line = document.createElement('div');
        line.textContent = msg;
        modalLog.appendChild(line);
    });
    modalLog.scrollTop = modalLog.scrollHeight;
}

function getMoveLabel(moveId) {
    return moveNameMap.get(moveId) || moveId.replace(/-/g, ' ');
}

function getTypeClass(typeId) {
    const type = (typeId || '').toLowerCase();
    const map = {
        normal: 'bg-stone-600 hover:bg-stone-500',
        fire: 'bg-orange-600 hover:bg-orange-500',
        water: 'bg-sky-600 hover:bg-sky-500',
        grass: 'bg-emerald-600 hover:bg-emerald-500',
        electric: 'bg-yellow-500 hover:bg-yellow-400 text-black',
        ice: 'bg-cyan-500 hover:bg-cyan-400 text-black',
        fighting: 'bg-red-700 hover:bg-red-600',
        poison: 'bg-violet-700 hover:bg-violet-600',
        ground: 'bg-amber-700 hover:bg-amber-600',
        flying: 'bg-indigo-500 hover:bg-indigo-400',
        psychic: 'bg-pink-600 hover:bg-pink-500',
        bug: 'bg-lime-600 hover:bg-lime-500 text-black',
        rock: 'bg-yellow-700 hover:bg-yellow-600',
        ghost: 'bg-purple-700 hover:bg-purple-600',
        dragon: 'bg-blue-700 hover:bg-blue-600',
        dark: 'bg-gray-700 hover:bg-gray-600',
        steel: 'bg-slate-500 hover:bg-slate-400',
        fairy: 'bg-rose-500 hover:bg-rose-400 text-black',
    };
    return map[type] || 'bg-blue-700 hover:bg-blue-600';
}

function initTeamBuilder() {
    fetch('/api/demo-data')
        .then(res => res.json())
        .then(data => {
            demoData = data;
            moveNameMap = new Map((data.moves || []).map(move => [move.id, move.name || move.id]));
            moveInfoMap = new Map((data.moves || []).map(move => [move.id, move]));
            setupTeamSlots();
        })
        .catch(() => {
            setLobbyError('チームデータの取得に失敗しました。再読み込みしてください。');
        });
}

function setupTeamSlots() {
    if (!demoData?.species?.length) return;
    const slots = Array.from(document.querySelectorAll('[data-team-slot]'));
    const sortedSpecies = [...demoData.species].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    slots.forEach((slotEl, index) => {
        const speciesSelect = slotEl.querySelector('.species-select');
        speciesSelect.innerHTML = '';
        sortedSpecies.forEach(spec => {
            const option = document.createElement('option');
            option.value = spec.id;
            option.textContent = `${spec.name} (${spec.id})`;
            speciesSelect.appendChild(option);
        });
        speciesSelect.selectedIndex = index % sortedSpecies.length;
        speciesSelect.addEventListener('change', () => updateOptionsForSlot(slotEl));
        
        // Setup Item select (it doesn't change by species usually in this demo)
        const itemSelect = slotEl.querySelector('.item-select');
        itemSelect.innerHTML = '';
        (demoData.items || []).forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            itemSelect.appendChild(option);
        });

        updateOptionsForSlot(slotEl);
    });
}

function updateOptionsForSlot(slotEl) {
    const speciesSelect = slotEl.querySelector('.species-select');
    const speciesId = speciesSelect.value;
    const spec = demoData.species.find(s => s.id === speciesId);

    // Update Ability select
    const abilitySelect = slotEl.querySelector('.ability-select');
    abilitySelect.innerHTML = '';
    (spec?.abilities || []).forEach(abId => {
        const option = document.createElement('option');
        option.value = abId;
        option.textContent = formatLabel(abId);
        abilitySelect.appendChild(option);
    });

    // Update Move selects
    const moveSelects = Array.from(slotEl.querySelectorAll('.move-select'));
    const availableMoves = getMovesForSpecies(speciesId);
    moveSelects.forEach((select, idx) => {
        select.innerHTML = '';
        availableMoves.forEach(moveId => {
            const option = document.createElement('option');
            option.value = moveId;
            option.textContent = getMoveLabel(moveId);
            select.appendChild(option);
        });
        if (availableMoves.length) {
            select.selectedIndex = Math.min(idx, availableMoves.length - 1);
        }
    });
}

function getMovesForSpecies(speciesId) {
    const learnsets = demoData?.learnsets || {};
    const moves = learnsets[speciesId] || [];
    if (moves.length) return moves;
    return (demoData?.moves || []).map(move => move.id);
}

function collectTeamSelection() {
    const slots = Array.from(document.querySelectorAll('[data-team-slot]'));
    return slots.map(slotEl => {
        const speciesId = slotEl.querySelector('.species-select')?.value;
        const ability = slotEl.querySelector('.ability-select')?.value;
        const item = slotEl.querySelector('.item-select')?.value;
        const moves = Array.from(slotEl.querySelectorAll('.move-select'))
            .map(select => select.value)
            .filter(Boolean);
        return { speciesId, moves, ability, item };
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initTeamBuilder();
});
