// ========================================
// Blockly Custom Blocks & Toolbox for Tatuta Step DSL
// ========================================

(function () {
    "use strict";

    // ── Colour palette (Blockly hue 0-360) ──
    const HUE = {
        attack: 20,
        status: 260,
        flow: 210,
        field: 120,
        special: 330,
    };

    const CATEGORY_MAP = {
        damage: "attack", damage_ratio: "attack", ohko: "attack",
        apply_status: "status", remove_status: "status", modify_stage: "status",
        chance: "flow", conditional: "flow", repeat: "flow", delay: "flow", over_time: "flow",
        apply_field_status: "field", set_weather: "field",
        protect: "special", force_switch: "special", self_switch: "special",
        lock_move: "special", random_move: "special", manual: "special",
    };

    function hueFor(type) {
        return HUE[CATEGORY_MAP[type] || "special"];
    }

    // ── Shared dropdown options (mirrors app.js constants) ──
    const STATUS_OPTS = [
        ["やけど", "burn"], ["まひ", "paralysis"], ["ねむり", "sleep"],
        ["どく", "poison"], ["もうどく", "bad_poison"], ["こおり", "freeze"],
        ["こんらん", "confusion"], ["ひるみ", "flinch"], ["ねむけ", "yawn"],
    ];
    const TARGET_OPTS = [["相手", "target"], ["自分", "self"]];
    const FIELD_STATUS_OPTS = [
        ["リフレクター", "reflect"], ["ひかりのかべ", "light_screen"],
        ["おいかぜ", "tailwind"], ["ステルスロック", "stealth_rock"],
        ["まきびし", "spikes"], ["どくびし", "toxic_spikes"],
        ["ねばねばネット", "sticky_web"],
    ];
    const STAGE_KEYS = [
        ["攻撃", "atk"], ["防御", "def"], ["特攻", "spa"],
        ["特防", "spd"], ["素早さ", "spe"], ["命中", "accuracy"],
        ["回避", "evasion"],
    ];

    // ========================================
    // BLOCK DEFINITIONS
    // ========================================

    // --- damage ---
    Blockly.defineBlocksWithJsonArray([
        {
            type: "step_damage",
            message0: "⚔️ ダメージ  威力 %1  命中 %2  対象 %3",
            args0: [
                { type: "input_value", name: "POWER", check: "Number" },
                { type: "input_value", name: "ACCURACY", check: "Number" },
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("damage"),
            tooltip: "ダメージを与えるステップ（威力に $damage などの変数指定可）",
        },

        // --- DSL Variable/Expression Support ---
        {
            type: "dsl_variable",
            message0: "💎 %1",
            args0: [
                {
                    type: "field_dropdown",
                    name: "VAR",
                    options: [
                        ["与ダメージ", "$damage"],
                        ["自分のHP", "$user.hp"],
                        ["自分最大HP", "$user.max_hp"],
                        ["相手のHP", "$target.hp"],
                        ["相手最大HP", "$target.max_hp"],
                    ]
                }
            ],
            output: "Number",
            colour: 230,
            tooltip: "DSLの変数"
        },
        {
            type: "dsl_math_number",
            message0: "%1",
            args0: [{ type: "field_number", name: "NUM", value: 0 }],
            output: "Number",
            colour: 230,
            tooltip: "数値"
        },

        // --- damage_ratio ---
        {
            type: "step_damage_ratio",
            message0: "💥 割合ダメージ  対象 %1\n  最大HP割合 %2  現在HP割合 %3",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
                { type: "field_number", name: "RATIO_MAX_HP", value: 0, precision: 0.05 },
                { type: "field_number", name: "RATIO_CURRENT_HP", value: 0, precision: 0.05 },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("damage_ratio"),
            tooltip: "HP割合でダメージを与える",
        },

        // --- ohko ---
        {
            type: "step_ohko",
            message0: "💀 一撃必殺  基本命中 %1",
            args0: [
                { type: "field_number", name: "BASE_ACCURACY", value: 0.3, precision: 0.1 },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("ohko"),
            tooltip: "一撃必殺技",
        },

        // --- apply_status ---
        {
            type: "step_apply_status",
            message0: "🔮 状態異常付与  異常 %1  対象 %2  確率 %3",
            args0: [
                { type: "field_dropdown", name: "STATUS_ID", options: STATUS_OPTS },
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
                { type: "field_number", name: "CHANCE", value: 1.0, precision: 0.1 },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("apply_status"),
            tooltip: "状態異常を付与する",
        },

        // --- remove_status ---
        {
            type: "step_remove_status",
            message0: "💊 状態異常回復  対象 %1",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("remove_status"),
            tooltip: "状態異常を回復する",
        },

        // --- modify_stage ---
        {
            type: "step_modify_stage",
            message0: "📊 能力ランク変化  対象 %1  確率 %2",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
                { type: "field_number", name: "CHANCE", value: 1.0, precision: 0.1 },
            ],
            message1: "攻 %1  防 %2  特攻 %3  特防 %4",
            args1: [
                { type: "field_number", name: "ATK", value: 0 },
                { type: "field_number", name: "DEF", value: 0 },
                { type: "field_number", name: "SPA", value: 0 },
                { type: "field_number", name: "SPD", value: 0 },
            ],
            message2: "素早 %1  命中 %2  回避 %3",
            args2: [
                { type: "field_number", name: "SPE", value: 0 },
                { type: "field_number", name: "ACCURACY_STAGE", value: 0 },
                { type: "field_number", name: "EVASION", value: 0 },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("modify_stage"),
            tooltip: "能力ランクを変化させる",
        },

        // --- chance (C-block) ---
        {
            type: "step_chance",
            message0: "🎲 確率分岐  確率 %1",
            args0: [
                { type: "field_number", name: "P", value: 0.5, precision: 0.1 },
            ],
            message1: "✅ 成功時 %1",
            args1: [
                { type: "input_statement", name: "THEN", check: "step" },
            ],
            message2: "❌ 失敗時 %1",
            args2: [
                { type: "input_statement", name: "ELSE", check: "step" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("chance"),
            tooltip: "確率で分岐する",
        },

        // --- conditional (C-block) ---
        {
            type: "step_conditional",
            message0: "❓ 条件分岐  条件 %1",
            args0: [
                { type: "field_input", name: "IF_COND", text: "" },
            ],
            message1: "✅ 一致時 %1",
            args1: [
                { type: "input_statement", name: "THEN", check: "step" },
            ],
            message2: "❌ 不一致時 %1",
            args2: [
                { type: "input_statement", name: "ELSE", check: "step" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("conditional"),
            tooltip: "条件で分岐する",
        },

        // --- repeat (C-block) ---
        {
            type: "step_repeat",
            message0: "🔄 繰り返し  最小 %1  最大 %2",
            args0: [
                { type: "field_number", name: "TIMES_MIN", value: 2 },
                { type: "field_number", name: "TIMES_MAX", value: 5 },
            ],
            message1: "🔁 繰り返すタスク %1",
            args1: [
                { type: "input_statement", name: "EFFECTS", check: "step" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("repeat"),
            tooltip: "指定回数繰り返す",
        },

        // --- delay (C-block) ---
        {
            type: "step_delay",
            message0: "⏳ 遅延発動  %1 ターン後",
            args0: [
                { type: "field_number", name: "AFTER_TURNS", value: 1 },
            ],
            message1: "発動タスク %1",
            args1: [
                { type: "input_statement", name: "EFFECTS", check: "step" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("delay"),
            tooltip: "指定ターン後に発動",
        },

        // --- over_time (C-block) ---
        {
            type: "step_over_time",
            message0: "⏱️ 継続効果  %1 ターン",
            args0: [
                { type: "field_number", name: "DURATION", value: 5 },
            ],
            message1: "毎ターンのタスク %1",
            args1: [
                { type: "input_statement", name: "EFFECTS", check: "step" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("over_time"),
            tooltip: "毎ターン発動する効果",
        },

        // --- apply_field_status ---
        {
            type: "step_apply_field_status",
            message0: "🌍 場の状態付与  状態 %1  対象 %2",
            args0: [
                { type: "field_dropdown", name: "STATUS_ID", options: FIELD_STATUS_OPTS },
                { type: "field_dropdown", name: "TARGET", options: [["場", "field"], ["相手", "target"], ["自分", "self"]] },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("apply_field_status"),
            tooltip: "場に状態を設定する",
        },

        // --- protect ---
        {
            type: "step_protect",
            message0: "🛡️ まもる",
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("protect"),
            tooltip: "まもる",
        },

        // --- force_switch ---
        {
            type: "step_force_switch",
            message0: "↩️ 強制交代  対象 %1",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("force_switch"),
            tooltip: "相手を強制交代させる",
        },

        // --- self_switch ---
        {
            type: "step_self_switch",
            message0: "🔀 自分交代  対象 %1",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: [["自分", "self"], ["相手", "target"]] },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("self_switch"),
            tooltip: "自分を交代させる",
        },

        // --- lock_move ---
        {
            type: "step_lock_move",
            message0: "🔒 技固定  対象 %1  期間 %2  モード %3",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
                { type: "field_number", name: "DURATION", value: 3 },
                { type: "field_dropdown", name: "MODE", options: [["指定技", "force_specific"], ["直前の技", "force_last_move"]] },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("lock_move"),
            tooltip: "対象の技を固定する",
        },

        // --- random_move ---
        {
            type: "step_random_move",
            message0: "🎰 ランダム技",
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("random_move"),
            tooltip: "ランダムに技を使う",
        },

        // --- manual ---
        {
            type: "step_manual",
            message0: "🔧 手動処理  理由 %1",
            args0: [
                { type: "field_input", name: "MANUAL_REASON", text: "" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("manual"),
            tooltip: "手動で処理するステップ",
        },
    ]);

    // ========================================
    // TOOLBOX DEFINITION
    // ========================================

    const TOOLBOX = {
        kind: "categoryToolbox",
        contents: [
            {
                kind: "category",
                name: "⚔️ 攻撃",
                colour: HUE.attack,
                contents: [
                    { kind: "block", type: "step_damage" },
                    { kind: "block", type: "step_damage_ratio" },
                    { kind: "block", type: "step_ohko" },
                ],
            },
            {
                kind: "category",
                name: "🔮 状態",
                colour: HUE.status,
                contents: [
                    { kind: "block", type: "step_apply_status" },
                    { kind: "block", type: "step_remove_status" },
                    { kind: "block", type: "step_modify_stage" },
                ],
            },
            {
                kind: "category",
                name: "🎲 フロー",
                colour: HUE.flow,
                contents: [
                    { kind: "block", type: "step_chance" },
                    { kind: "block", type: "step_conditional" },
                    { kind: "block", type: "step_repeat" },
                    { kind: "block", type: "step_delay" },
                    { kind: "block", type: "step_over_time" },
                ],
            },
            {
                kind: "category",
                name: "🌍 フィールド",
                colour: HUE.field,
                contents: [
                    { kind: "block", type: "step_apply_field_status" },
                ],
            },
            {
                kind: "category",
                name: "🛡️ 特殊",
                colour: HUE.special,
                contents: [
                    { kind: "block", type: "step_protect" },
                    { kind: "block", type: "step_force_switch" },
                    { kind: "block", type: "step_self_switch" },
                    { kind: "block", type: "step_lock_move" },
                    { kind: "block", type: "step_random_move" },
                    { kind: "block", type: "step_manual" },
                ],
            },
            {
                kind: "sep",
            },
            {
                kind: "category",
                name: "🛠️ 変数/計算",
                colour: 230,
                contents: [
                    { kind: "block", type: "dsl_variable" },
                    { kind: "block", type: "dsl_math_number" },
                    {
                        kind: "block",
                        type: "math_arithmetic",
                        fields: { OP: "MULTIPLY" },
                        inputs: {
                            A: { kind: "block", type: "dsl_variable", fields: { VAR: "$damage" } },
                            B: { kind: "block", type: "dsl_math_number", fields: { NUM: 1.5 } }
                        }
                    },
                    { kind: "block", type: "math_arithmetic" },
                ],
            },
        ],
    };

    // ========================================
    // DATA CONVERSION: JSON steps → Blockly
    // ========================================

    /** Map step.type → Blockly block type string */
    const STEP_TO_BLOCK = {
        damage: "step_damage",
        damage_ratio: "step_damage_ratio",
        ohko: "step_ohko",
        apply_status: "step_apply_status",
        remove_status: "step_remove_status",
        modify_stage: "step_modify_stage",
        chance: "step_chance",
        conditional: "step_conditional",
        repeat: "step_repeat",
        delay: "step_delay",
        over_time: "step_over_time",
        apply_field_status: "step_apply_field_status",
        protect: "step_protect",
        force_switch: "step_force_switch",
        self_switch: "step_self_switch",
        lock_move: "step_lock_move",
        random_move: "step_random_move",
        manual: "step_manual",
    };

    const BLOCK_TO_STEP = {};
    for (const [k, v] of Object.entries(STEP_TO_BLOCK)) BLOCK_TO_STEP[v] = k;

    function expressionToBlock(value, workspace) {
        if (value == null) return null;
        const s = String(value).trim();

        // 1. Variable
        if (s.startsWith("$") && !s.includes(" ")) {
            const b = workspace.newBlock("dsl_variable");
            b.setFieldValue(s, "VAR");
            b.initSvg();
            return b;
        }

        // 2. Simple Number
        if (/^-?\d+(\.\d+)?$/.test(s)) {
            const b = workspace.newBlock("dsl_math_number");
            b.setFieldValue(Number(s), "NUM");
            b.initSvg();
            return b;
        }

        // 3. Parenthesized expression ( (a op b) )
        if (s.startsWith("(") && s.endsWith(")")) {
            const inner = s.slice(1, -1).trim();
            const parts = splitExpression(inner);
            if (parts) {
                const b = workspace.newBlock("math_arithmetic");
                const opMap = { "+": "ADD", "-": "MINUS", "*": "MULTIPLY", "/": "DIVIDE", "^": "POWER" };
                b.setFieldValue(opMap[parts.op] || "ADD", "OP");
                const left = expressionToBlock(parts.left, workspace);
                const right = expressionToBlock(parts.right, workspace);
                if (left) b.getInput("A").connection.connect(left.outputConnection);
                if (right) b.getInput("B").connection.connect(right.outputConnection);
                b.initSvg();
                return b;
            }
        }

        return null;
    }

    function splitExpression(s) {
        let depth = 0;
        const ops = ["+", "-", "*", "/", "^"];
        for (let i = s.length - 1; i >= 0; i--) {
            const c = s[i];
            if (c === ")") depth++;
            else if (c === "(") depth--;
            else if (depth === 0 && ops.includes(c)) {
                return {
                    left: s.substring(0, i).trim(),
                    op: c,
                    right: s.substring(i + 1).trim()
                };
            }
        }
        return null;
    }

    /**
     * Load an array of steps into the Blockly workspace.
     * Clears existing blocks first.
     */
    function stepsToBlocks(steps, workspace) {
        workspace.clear();
        if (!steps || steps.length === 0) return;

        let prevBlock = null;
        steps.forEach((step) => {
            const block = stepToBlock(step, workspace);
            if (!block) return;
            if (prevBlock) {
                prevBlock.nextConnection.connect(block.previousConnection);
            }
            prevBlock = block;
        });

        workspace.render();
        // Center the blocks nicely
        workspace.scrollCenter();
    }

    function stepToBlock(step, workspace) {
        const blockType = STEP_TO_BLOCK[step.type];
        if (!blockType) {
            // Fallback: use manual block with reason
            const block = workspace.newBlock("step_manual");
            block.setFieldValue(step.manualReason || `type: ${step.type}`, "MANUAL_REASON");
            block.initSvg();
            return block;
        }

        const block = workspace.newBlock(blockType);

        // Set field values based on step type
        switch (step.type) {
            case "damage":
                if (step.power != null) {
                    const powerBlock = expressionToBlock(step.power, workspace);
                    if (powerBlock) block.getInput("POWER").connection.connect(powerBlock.outputConnection);
                }
                if (step.accuracy != null) {
                    const accBlock = expressionToBlock(step.accuracy, workspace);
                    if (accBlock) block.getInput("ACCURACY").connection.connect(accBlock.outputConnection);
                }
                if (step.target) block.setFieldValue(step.target, "TARGET");
                break;

            case "damage_ratio":
                if (step.target) block.setFieldValue(step.target, "TARGET");
                if (step.ratioMaxHp != null) block.setFieldValue(step.ratioMaxHp, "RATIO_MAX_HP");
                if (step.ratioCurrentHp != null) block.setFieldValue(step.ratioCurrentHp, "RATIO_CURRENT_HP");
                break;

            case "ohko":
                if (step.baseAccuracy != null) block.setFieldValue(step.baseAccuracy, "BASE_ACCURACY");
                break;

            case "apply_status":
                if (step.statusId) block.setFieldValue(step.statusId, "STATUS_ID");
                if (step.target) block.setFieldValue(step.target, "TARGET");
                if (step.chance != null) block.setFieldValue(step.chance, "CHANCE");
                break;

            case "remove_status":
                if (step.target) block.setFieldValue(step.target, "TARGET");
                break;

            case "modify_stage": {
                if (step.target) block.setFieldValue(step.target, "TARGET");
                if (step.chance != null) block.setFieldValue(step.chance, "CHANCE");
                const stages = step.stages || {};
                if (stages.atk != null) block.setFieldValue(stages.atk, "ATK");
                if (stages.def != null) block.setFieldValue(stages.def, "DEF");
                if (stages.spa != null) block.setFieldValue(stages.spa, "SPA");
                if (stages.spd != null) block.setFieldValue(stages.spd, "SPD");
                if (stages.spe != null) block.setFieldValue(stages.spe, "SPE");
                if (stages.accuracy != null) block.setFieldValue(stages.accuracy, "ACCURACY_STAGE");
                if (stages.evasion != null) block.setFieldValue(stages.evasion, "EVASION");
                break;
            }

            case "chance":
                if (step.p != null) block.setFieldValue(step.p, "P");
                connectNestedSteps(step.then, block, "THEN", workspace);
                connectNestedSteps(step.else, block, "ELSE", workspace);
                break;

            case "conditional":
                if (step.if) block.setFieldValue(typeof step.if === "string" ? step.if : JSON.stringify(step.if), "IF_COND");
                connectNestedSteps(step.then, block, "THEN", workspace);
                connectNestedSteps(step.else, block, "ELSE", workspace);
                break;

            case "repeat": {
                const times = step.times || {};
                if (times.min != null) block.setFieldValue(times.min, "TIMES_MIN");
                if (times.max != null) block.setFieldValue(times.max, "TIMES_MAX");
                connectNestedSteps(step.effects, block, "EFFECTS", workspace);
                break;
            }

            case "delay":
                if (step.afterTurns != null) block.setFieldValue(step.afterTurns, "AFTER_TURNS");
                connectNestedSteps(step.effects, block, "EFFECTS", workspace);
                break;

            case "over_time":
                if (step.duration != null) block.setFieldValue(step.duration, "DURATION");
                connectNestedSteps(step.effects, block, "EFFECTS", workspace);
                break;

            case "apply_field_status":
                if (step.statusId) block.setFieldValue(step.statusId, "STATUS_ID");
                if (step.target) block.setFieldValue(step.target, "TARGET");
                break;

            case "force_switch":
            case "self_switch":
                if (step.target) block.setFieldValue(step.target, "TARGET");
                break;

            case "lock_move":
                if (step.target) block.setFieldValue(step.target, "TARGET");
                if (step.duration != null) block.setFieldValue(step.duration, "DURATION");
                if (step.mode) block.setFieldValue(step.mode, "MODE");
                break;

            case "manual":
                if (step.manualReason) block.setFieldValue(step.manualReason, "MANUAL_REASON");
                break;
        }

        block.initSvg();
        return block;
    }

    function connectNestedSteps(steps, parentBlock, inputName, workspace) {
        if (!steps || !Array.isArray(steps) || steps.length === 0) return;
        const connection = parentBlock.getInput(inputName)?.connection;
        if (!connection) return;

        let prevBlock = null;
        steps.forEach((step) => {
            const child = stepToBlock(step, workspace);
            if (!child) return;
            if (!prevBlock) {
                connection.connect(child.previousConnection);
            } else {
                prevBlock.nextConnection.connect(child.previousConnection);
            }
            prevBlock = child;
        });
    }

    // ========================================
    // DATA CONVERSION: Blockly → JSON steps
    // ========================================

    function blocksToSteps(workspace) {
        const topBlocks = workspace.getTopBlocks(true);
        if (topBlocks.length === 0) return [{ type: "manual" }];

        // We only care about the first chain for now
        const chain = topBlocks[0];
        return readBlockChain(chain);
    }

    function readBlockChain(block) {
        const steps = [];
        let current = block;
        while (current) {
            const step = blockToStep(current);
            if (step) steps.push(step);
            current = current.getNextBlock();
        }
        return steps.length > 0 ? steps : [{ type: "manual" }];
    }

    function blockToExpression(block) {
        if (!block) return null;
        if (block.type === "dsl_math_number") {
            return block.getFieldValue("NUM");
        }
        if (block.type === "math_number") {
            return block.getFieldValue("NUM");
        }
        if (block.type === "dsl_variable") {
            return block.getFieldValue("VAR");
        }
        if (block.type === "math_arithmetic") {
            const left = blockToExpression(block.getInputTargetBlock("A"));
            const right = blockToExpression(block.getInputTargetBlock("B"));
            const op = block.getFieldValue("OP");
            const opMap = { ADD: "+", MINUS: "-", MULTIPLY: "*", DIVIDE: "/", POWER: "^" };
            const opSym = opMap[op] || "+";
            return `(${left} ${opSym} ${right})`;
        }
        return null;
    }

    function blockToStep(block) {
        const stepType = BLOCK_TO_STEP[block.type];
        if (!stepType) return null;

        const step = { type: stepType };

        switch (stepType) {
            case "damage":
                step.power = blockToExpression(block.getInputTargetBlock("POWER"));
                step.accuracy = blockToExpression(block.getInputTargetBlock("ACCURACY"));
                step.target = block.getFieldValue("TARGET");
                break;

            case "damage_ratio":
                step.target = block.getFieldValue("TARGET");
                step.ratioMaxHp = block.getFieldValue("RATIO_MAX_HP");
                step.ratioCurrentHp = block.getFieldValue("RATIO_CURRENT_HP");
                break;

            case "ohko":
                step.baseAccuracy = block.getFieldValue("BASE_ACCURACY");
                break;

            case "apply_status":
                step.statusId = block.getFieldValue("STATUS_ID");
                step.target = block.getFieldValue("TARGET");
                step.chance = block.getFieldValue("CHANCE");
                break;

            case "remove_status":
                step.target = block.getFieldValue("TARGET");
                break;

            case "modify_stage": {
                step.target = block.getFieldValue("TARGET");
                step.chance = block.getFieldValue("CHANCE");
                const stages = {};
                for (const [key, field] of [
                    ["atk", "ATK"], ["def", "DEF"], ["spa", "SPA"], ["spd", "SPD"],
                    ["spe", "SPE"], ["accuracy", "ACCURACY_STAGE"], ["evasion", "EVASION"],
                ]) {
                    const v = block.getFieldValue(field);
                    if (v !== 0 && v != null) stages[key] = v;
                }
                if (Object.keys(stages).length > 0) step.stages = stages;
                break;
            }

            case "chance":
                step.p = block.getFieldValue("P");
                step.then = readStatementSteps(block, "THEN");
                step.else = readStatementSteps(block, "ELSE");
                break;

            case "conditional":
                step.if = block.getFieldValue("IF_COND");
                step.then = readStatementSteps(block, "THEN");
                step.else = readStatementSteps(block, "ELSE");
                break;

            case "repeat":
                step.times = {
                    min: block.getFieldValue("TIMES_MIN"),
                    max: block.getFieldValue("TIMES_MAX"),
                };
                step.effects = readStatementSteps(block, "EFFECTS");
                break;

            case "delay":
                step.afterTurns = block.getFieldValue("AFTER_TURNS");
                step.effects = readStatementSteps(block, "EFFECTS");
                break;

            case "over_time":
                step.duration = block.getFieldValue("DURATION");
                step.effects = readStatementSteps(block, "EFFECTS");
                break;

            case "apply_field_status":
                step.statusId = block.getFieldValue("STATUS_ID");
                step.target = block.getFieldValue("TARGET");
                break;

            case "force_switch":
            case "self_switch":
                step.target = block.getFieldValue("TARGET");
                break;

            case "lock_move":
                step.target = block.getFieldValue("TARGET");
                step.duration = block.getFieldValue("DURATION");
                step.mode = block.getFieldValue("MODE");
                break;

            case "manual": {
                const reason = block.getFieldValue("MANUAL_REASON");
                if (reason) step.manualReason = reason;
                break;
            }
        }

        // Remove undefined/null/empty values
        for (const key of Object.keys(step)) {
            if (step[key] === undefined || step[key] === null) delete step[key];
        }

        return step;
    }

    function readStatementSteps(block, inputName) {
        const child = block.getInputTargetBlock(inputName);
        if (!child) return undefined;
        return readBlockChain(child);
    }

    // ========================================
    // WORKSPACE INJECTION
    // ========================================

    let _workspace = null;

    function injectWorkspace(containerId, onChangeCallback) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error("Blockly container not found:", containerId);
            return null;
        }

        _workspace = Blockly.inject(container, {
            toolbox: TOOLBOX,
            grid: { spacing: 20, length: 3, colour: "#ddd", snap: true },
            zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.3, scaleSpeed: 1.2 },
            trashcan: true,
            move: { scrollbars: true, drag: true, wheel: true },
            renderer: "zelos", // Scratch-like renderer
            sounds: false,
            theme: Blockly.Theme.defineTheme("tatuta", {
                base: Blockly.Themes.Zelos,
                name: "tatuta",
                componentStyles: {
                    workspaceBackgroundColour: "#f8f6f2",
                    toolboxBackgroundColour: "#2d2b27",
                    toolboxForegroundColour: "#f5f1eb",
                    flyoutBackgroundColour: "#3a3833",
                    flyoutForegroundColour: "#f5f1eb",
                    scrollbarColour: "#8a8577",
                    scrollbarOpacity: 0.6,
                },
            }),
        });

        // Debounced change listener
        let changeTimer = null;
        _workspace.addChangeListener((event) => {
            // Only react to meaningful events
            if (
                event.type === Blockly.Events.BLOCK_CHANGE ||
                event.type === Blockly.Events.BLOCK_MOVE ||
                event.type === Blockly.Events.BLOCK_CREATE ||
                event.type === Blockly.Events.BLOCK_DELETE
            ) {
                clearTimeout(changeTimer);
                changeTimer = setTimeout(() => {
                    if (onChangeCallback) onChangeCallback();
                }, 200);
            }
        });

        return _workspace;
    }

    function getWorkspace() {
        return _workspace;
    }

    // ========================================
    // PUBLIC API
    // ========================================

    window.TatutaBlockly = {
        TOOLBOX,
        injectWorkspace,
        getWorkspace,
        stepsToBlocks,
        blocksToSteps,
    };
})();
