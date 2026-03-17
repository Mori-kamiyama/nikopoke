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
        chance: "flow", conditional: "flow", repeat: "flow", delay: "flow", over_time: "flow", wait: "flow",
        apply_field_status: "field", set_weather: "field", remove_field_status: "field",
        protect: "special", force_switch: "special", self_switch: "special",
        lock_move: "special", random_move: "special", manual: "special", disable_move: "special",
    };

    function hueFor(type) {
        return HUE[CATEGORY_MAP[type] || "special"];
    }

    // ── Shared dropdown options (mirrors app.js constants) ──
    const STATUS_OPTS = [
        ["やけど", "burn"], ["まひ", "paralysis"], ["ねむり", "sleep"],
        ["どく", "poison"], ["もうどく", "bad_poison"], ["こおり", "freeze"],
        ["こんらん", "confusion"], ["ひるみ", "flinch"], ["ねむけ", "yawn"],
        ["かなしばり", "disable_move"], ["行動固定", "lock_move"], ["みがわり", "substitute"],
        ["テレキネシス", "telekinesis"], ["ひんし", "fainted"], ["直前の味方ひんし", "fainted_ally_last_turn"],
        ["まもる", "protect"], ["ちいさくなる", "minimize"], ["ゴースト状態", "ghost"],
        ["そらにいる", "flying"], ["ダイビング中", "dive"], ["ふみん", "insomnia"],
        ["味方対象", "ally"], ["こうげき上昇中", "atk_stage_up"], ["ぼうぎょ上昇中", "def_stage_up"],
        ["とくこう上昇中", "spa_stage_up"], ["とくぼう上昇中", "spd_stage_up"], ["すばやさ上昇中", "spe_stage_up"],
        ["能力上昇中", "stat_boost"], ["ふくしゅう1", "revenge_boost"], ["ふくしゅう2", "revenge_boost_2"],
        ["ふくしゅう3", "revenge_boost_3"], ["ふくしゅう4", "revenge_boost_4"], ["ふくしゅう5", "revenge_boost_5"],
        ["ふくしゅう6", "revenge_boost_6"], ["やけど (旧表記)", "やけど"],
    ];
    const TARGET_OPTS = [["相手", "target"], ["自分", "self"], ["全体", "all"]];
    const OPTIONAL_TARGET_OPTS = [["未指定", ""], ...TARGET_OPTS];
    const FIELD_STATUS_OPTS = [
        ["にほんばれ", "sun"], ["ひざしがつよい", "sunny"], ["あまごい", "rain"], ["あめ", "rainy"],
        ["すなあらし", "sandstorm"], ["ゆき", "snow"], ["ゆき (旧表記)", "snowscape"],
        ["エレキフィールド", "electric_terrain"], ["くさのフィールド", "grass_field"], ["グラスフィールド", "grassy_terrain"],
        ["ミストフィールド", "misty_terrain"], ["しろいきり", "mist"],
        ["サイコフィールド", "psychic_terrain"], ["サイコフィールド (旧表記)", "psycho_terrain"],
        ["トリックルーム", "trick_room"],
        ["リフレクター", "reflect"], ["ひかりのかべ", "light_screen"],
        ["オーロラベール", "aurora_veil"], ["おいかぜ", "tailwind"], ["ステルスロック", "stealth_rock"],
        ["まきびし", "spikes"], ["どくびし", "toxic_spikes"],
        ["ねばねばネット", "sticky_web"], ["エコーボイス強化", "echo_voice_power_up"],
    ];
    const FIELD_STATUS_LABELS = new Map(FIELD_STATUS_OPTS.map(([label, value]) => [value, label]));
    const STATUS_LABELS = new Map(STATUS_OPTS.map(([label, value]) => [value, label]));
    const CONDITION_TYPE_OPTS = [
        ["自分が状態", "user_has_status"],
        ["相手が状態", "target_has_status"],
        ["場が状態", "field_has_status"],
        ["自分HP以下", "user_hp_ratio_lte"],
        ["相手HP以下", "target_hp_ratio_lte"],
        ["自分ランク以上", "user_stat_stage_gte"],
        ["相手ランク以上", "target_stat_stage_gte"],
        ["常に真", "always"],
    ];
    const STAGE_KEYS = [
        ["攻撃", "atk"], ["防御", "def"], ["特攻", "spa"],
        ["特防", "spd"], ["素早さ", "spe"], ["命中", "accuracy"],
        ["回避", "evasion"],
    ];
    const TIMED_FIELD_STATUSES = new Set([
        "sun", "sunny", "rain", "rainy", "sandstorm", "snow", "snowscape",
        "electric_terrain", "grass_field", "grassy_terrain", "misty_terrain",
        "psychic_terrain", "psycho_terrain", "reflect", "light_screen",
        "aurora_veil", "tailwind", "mist", "trick_room",
    ]);
    const STACKABLE_FIELD_STATUSES = new Set(["spikes", "toxic_spikes"]);

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
            message1: "期間 最小 %1  最大 %2",
            args1: [
                { type: "field_number", name: "DURATION_MIN", value: 0 },
                { type: "field_number", name: "DURATION_MAX", value: 0 },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("apply_status"),
            tooltip: "状態異常を付与する",
        },

        // --- remove_status ---
        {
            type: "step_remove_status",
            message0: "💊 状態異常回復  対象 %1  異常 %2",
            args0: [
                { type: "field_dropdown", name: "TARGET", options: TARGET_OPTS },
                { type: "field_dropdown", name: "STATUS_ID", options: [["指定なし", ""], ...STATUS_OPTS] },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("remove_status"),
            tooltip: "状態異常を回復する",
        },

        // --- remove_field_status ---
        {
            type: "step_remove_field_status",
            message0: "🧹 場の状態解除  状態 %1",
            args0: [
                { type: "field_dropdown", name: "STATUS_ID", options: FIELD_STATUS_OPTS },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("remove_field_status"),
            tooltip: "場の状態を解除する",
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
            message0: "❓ 条件分岐  条件 %1  状態 %2",
            args0: [
                { type: "field_dropdown", name: "COND_TYPE", options: CONDITION_TYPE_OPTS },
                { type: "field_dropdown", name: "STATUS_ID", options: [["指定なし", ""], ...STATUS_OPTS, ...FIELD_STATUS_OPTS] },
            ],
            message1: "能力 %1  値 %2",
            args1: [
                { type: "field_dropdown", name: "STAT_ID", options: [["指定なし", ""], ...STAGE_KEYS] },
                { type: "field_number", name: "VALUE", value: 0, precision: 0.05 },
            ],
            message2: "✅ 一致時 %1",
            args2: [
                { type: "input_statement", name: "THEN", check: "step" },
            ],
            message3: "❌ 不一致時 %1",
            args3: [
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
            message0: "⏳ 遅延発動  %1 ターン後  対象 %2",
            args0: [
                { type: "field_number", name: "AFTER_TURNS", value: 1 },
                { type: "field_dropdown", name: "TARGET", options: OPTIONAL_TARGET_OPTS },
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

        // --- wait (C-block) ---
        {
            type: "step_wait",
            message0: "⌛ 待機  %1 ターン  タイミング %2",
            args0: [
                { type: "field_number", name: "TURNS", value: 1 },
                { type: "field_dropdown", name: "TIMING", options: [["通常", ""], ["ターン開始", "turn_start"]] },
            ],
            message1: "待機後タスク %1",
            args1: [
                { type: "input_statement", name: "EFFECTS", check: "step" },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("wait"),
            tooltip: "指定ターン待機してから処理する",
        },

        // --- over_time (C-block) ---
        {
            type: "step_over_time",
            message0: "⏱️ 継続効果  %1 ターン  対象 %2",
            args0: [
                { type: "field_number", name: "DURATION", value: 0 },
                { type: "field_dropdown", name: "TARGET", options: OPTIONAL_TARGET_OPTS },
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
            message0: "🌍 場の状態付与  状態 %1  継続 %2  重ねがけ %3",
            args0: [
                { type: "field_dropdown", name: "STATUS_ID", options: FIELD_STATUS_OPTS },
                { type: "field_number", name: "DURATION", value: 0 },
                { type: "field_checkbox", name: "STACK", checked: false },
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
            message0: "↩️ 強制交代",
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("force_switch"),
            tooltip: "相手を強制交代させる",
        },

        // --- self_switch ---
        {
            type: "step_self_switch",
            message0: "🔀 自分交代",
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

        // --- disable_move ---
        {
            type: "step_disable_move",
            message0: "🚫 技封じ  期間 %1  対象 %2",
            args0: [
                { type: "field_number", name: "DURATION", value: 0 },
                { type: "field_dropdown", name: "TARGET", options: OPTIONAL_TARGET_OPTS },
            ],
            previousStatement: "step",
            nextStatement: "step",
            colour: hueFor("disable_move"),
            tooltip: "相手の技を一定ターン使えなくする",
        },

        // --- random_move ---
        {
            type: "step_random_move",
            message0: "🎰 ランダム技  プール %1",
            args0: [
                { type: "field_dropdown", name: "POOL", options: [["全技", "all"], ["自分の技", "self_moves"]] },
            ],
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

    Blockly.Blocks["step_apply_field_status"] = {
        init() {
            this.appendDummyInput("HEADER")
                .appendField("🌍 場の状態付与  状態")
                .appendField(new Blockly.FieldDropdown(FIELD_STATUS_OPTS), "STATUS_ID");
            this.appendDummyInput("DURATION_ROW")
                .appendField("継続")
                .appendField(new Blockly.FieldNumber(0, 0), "DURATION")
                .appendField("ターン");
            this.appendDummyInput("STACK_ROW")
                .appendField("重ねがけ")
                .appendField(new Blockly.FieldCheckbox("FALSE"), "STACK");
            this.setPreviousStatement(true, "step");
            this.setNextStatement(true, "step");
            this.setColour(hueFor("apply_field_status"));
            this.setTooltip("場に状態を設定する");
            this.getField("STATUS_ID").setValidator((value) => {
                setTimeout(() => this.updateShape_(), 0);
                return value;
            });
            this.updateShape_();
        },
        updateShape_() {
            const statusId = this.getFieldValue("STATUS_ID");
            const showDuration = TIMED_FIELD_STATUSES.has(statusId);
            const showStack = STACKABLE_FIELD_STATUSES.has(statusId);
            this.getInput("DURATION_ROW")?.setVisible(showDuration);
            this.getInput("STACK_ROW")?.setVisible(showStack);
            if (!showDuration) this.setFieldValue("0", "DURATION");
            if (!showStack) this.setFieldValue("FALSE", "STACK");
            if (this.rendered) this.render();
        },
    };

    Blockly.Blocks["step_conditional"] = {
        init() {
            this.appendDummyInput("HEADER")
                .appendField("❓ 条件分岐  条件")
                .appendField(new Blockly.FieldDropdown(CONDITION_TYPE_OPTS), "COND_TYPE");
            this.appendDummyInput("STATUS_ROW")
                .appendField("状態")
                .appendField(new Blockly.FieldDropdown([["指定なし", ""], ...STATUS_OPTS]), "STATUS_ID");
            this.appendDummyInput("FIELD_STATUS_ROW")
                .appendField("場の状態")
                .appendField(new Blockly.FieldDropdown([["指定なし", ""], ...FIELD_STATUS_OPTS]), "FIELD_STATUS_ID");
            this.appendDummyInput("STAT_ROW")
                .appendField("能力")
                .appendField(new Blockly.FieldDropdown([["指定なし", ""], ...STAGE_KEYS]), "STAT_ID");
            this.appendDummyInput("VALUE_ROW")
                .appendField("値")
                .appendField(new Blockly.FieldNumber(0, undefined, undefined, 0.05), "VALUE");
            this.appendStatementInput("THEN").setCheck("step").appendField("✅ 一致時");
            this.appendStatementInput("ELSE").setCheck("step").appendField("❌ 不一致時");
            this.setPreviousStatement(true, "step");
            this.setNextStatement(true, "step");
            this.setColour(hueFor("conditional"));
            this.setTooltip("条件で分岐する");
            this.getField("COND_TYPE").setValidator((value) => {
                setTimeout(() => this.updateShape_(), 0);
                return value;
            });
            this.updateShape_();
        },
        updateShape_() {
            const condType = this.getFieldValue("COND_TYPE");
            const isStatusCondition = condType === "user_has_status" || condType === "target_has_status";
            const isFieldStatusCondition = condType === "field_has_status";
            const isHpCondition = condType === "user_hp_ratio_lte" || condType === "target_hp_ratio_lte";
            const isStatCondition = condType === "user_stat_stage_gte" || condType === "target_stat_stage_gte";

            this.getInput("STATUS_ROW")?.setVisible(isStatusCondition);
            this.getInput("FIELD_STATUS_ROW")?.setVisible(isFieldStatusCondition);
            this.getInput("STAT_ROW")?.setVisible(isStatCondition);
            this.getInput("VALUE_ROW")?.setVisible(isHpCondition || isStatCondition);

            if (!isStatusCondition) this.setFieldValue("", "STATUS_ID");
            if (!isFieldStatusCondition) this.setFieldValue("", "FIELD_STATUS_ID");
            if (!isStatCondition) this.setFieldValue("", "STAT_ID");
            if (!(isHpCondition || isStatCondition)) this.setFieldValue("0", "VALUE");

            if (this.rendered) this.render();
        },
    };

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
                    { kind: "block", type: "step_wait" },
                ],
            },
            {
                kind: "category",
                name: "🌍 フィールド",
                colour: HUE.field,
                contents: [
                    { kind: "block", type: "step_apply_field_status" },
                    { kind: "block", type: "step_remove_field_status" },
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
                    { kind: "block", type: "step_disable_move" },
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
        remove_field_status: "step_remove_field_status",
        modify_stage: "step_modify_stage",
        chance: "step_chance",
        conditional: "step_conditional",
        repeat: "step_repeat",
        delay: "step_delay",
        over_time: "step_over_time",
        wait: "step_wait",
        apply_field_status: "step_apply_field_status",
        protect: "step_protect",
        force_switch: "step_force_switch",
        self_switch: "step_self_switch",
        lock_move: "step_lock_move",
        disable_move: "step_disable_move",
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

    function cloneStepValue(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function rememberOriginalStep(block, step) {
        if (!step || typeof step !== "object") return;
        block.data = JSON.stringify(step);
    }

    function readOriginalStep(block) {
        if (!block?.data) return null;
        try {
            const parsed = JSON.parse(block.data);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function ensureDropdownValue(block, fieldName, value, labels = new Map()) {
        if (value == null || value === "") return;
        const field = block.getField(fieldName);
        if (!field || typeof field.getOptions !== "function") return;
        const normalizedValue = String(value);
        const options = field.getOptions(false);
        if (!options.some(([, optionValue]) => String(optionValue) === normalizedValue)) {
            const label = labels.get(normalizedValue) || normalizedValue;
            const nextOptions = options.concat([[label, normalizedValue]]);
            field.menuGenerator_ = nextOptions;
        }
        field.setValue(normalizedValue);
    }

    function hasOwn(obj, key) {
        return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
    }

    function normalizeMinMaxLike(value) {
        if (value == null) return null;
        if (typeof value === "number") return { min: value, max: value, scalar: true };
        if (typeof value === "object") {
            const min = value.min == null ? 0 : Number(value.min);
            const max = value.max == null ? 0 : Number(value.max);
            return {
                min: Number.isFinite(min) ? min : 0,
                max: Number.isFinite(max) ? max : 0,
                scalar: false,
            };
        }
        return null;
    }

    function buildMinMaxLike(min, max, originalValue) {
        if (!(min > 0) && !(max > 0)) return undefined;
        if (!(max > 0)) max = min;
        if (!(min > 0)) min = max;
        if (max === min) {
            if (originalValue && typeof originalValue === "object") {
                return { min, max };
            }
            if (typeof originalValue === "number") return min;
            return min;
        }
        return { min, max };
    }

    function pruneEmpty(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        const next = {};
        Object.entries(value).forEach(([key, child]) => {
            if (child !== undefined && child !== null) next[key] = child;
        });
        return Object.keys(next).length > 0 ? next : undefined;
    }

    function mergeStepWithOriginal(stepType, originalStep, computedStep) {
        const merged = originalStep && typeof originalStep === "object"
            ? cloneStepValue(originalStep)
            : { type: stepType };
        merged.type = stepType;

        const clearKeys = (...keys) => keys.forEach((key) => delete merged[key]);
        switch (stepType) {
            case "damage":
                clearKeys("power", "accuracy", "target");
                break;
            case "damage_ratio":
                clearKeys("target", "ratioMaxHp", "ratioCurrentHp");
                break;
            case "ohko":
                clearKeys("baseAccuracy");
                break;
            case "apply_status":
                clearKeys("statusId", "target", "chance", "duration");
                break;
            case "remove_status":
                clearKeys("target", "statusId");
                break;
            case "remove_field_status":
                clearKeys("statusId");
                break;
            case "modify_stage":
                clearKeys("target", "chance", "stages");
                break;
            case "chance":
                clearKeys("p", "then", "else");
                break;
            case "conditional":
                clearKeys("if", "then", "else");
                break;
            case "repeat":
                clearKeys("times", "steps", "effects");
                break;
            case "delay":
                clearKeys("afterTurns", "turns", "target", "steps", "effects");
                break;
            case "over_time":
                clearKeys("duration", "target", "steps", "effects");
                break;
            case "wait":
                clearKeys("turns", "timing", "steps", "effects");
                break;
            case "apply_field_status":
                clearKeys("statusId", "target", "duration", "stack");
                break;
            case "protect":
                break;
            case "force_switch":
            case "self_switch":
                clearKeys("target");
                break;
            case "lock_move":
                clearKeys("target", "duration", "mode", "data");
                break;
            case "disable_move":
                clearKeys("target", "duration");
                break;
            case "random_move":
                clearKeys("pool");
                break;
            case "manual":
                clearKeys("manualReason");
                break;
        }

        Object.entries(computedStep).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            merged[key] = value;
        });

        Object.keys(merged).forEach((key) => {
            if (merged[key] === undefined || merged[key] === null) delete merged[key];
        });
        return merged;
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
            block.setFieldValue(step.manualReason || `未対応ステップ: ${step.type}`, "MANUAL_REASON");
            rememberOriginalStep(block, step);
            block.initSvg();
            return block;
        }

        const block = workspace.newBlock(blockType);
        rememberOriginalStep(block, step);

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
                ensureDropdownValue(block, "STATUS_ID", step.statusId, STATUS_LABELS);
                if (step.target) block.setFieldValue(step.target, "TARGET");
                if (step.chance != null) block.setFieldValue(step.chance, "CHANCE");
                {
                    const duration = normalizeMinMaxLike(step.duration);
                    if (duration) {
                        block.setFieldValue(duration.min, "DURATION_MIN");
                        block.setFieldValue(duration.max, "DURATION_MAX");
                    }
                }
                break;

            case "remove_status":
                if (step.target) block.setFieldValue(step.target, "TARGET");
                ensureDropdownValue(block, "STATUS_ID", step.statusId, STATUS_LABELS);
                break;

            case "remove_field_status":
                ensureDropdownValue(block, "STATUS_ID", step.statusId, FIELD_STATUS_LABELS);
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
                if (step.if && typeof step.if === "object") {
                    ensureDropdownValue(block, "COND_TYPE", step.if.type);
                    if (step.if.type === "field_has_status") {
                        ensureDropdownValue(block, "FIELD_STATUS_ID", step.if.statusId, FIELD_STATUS_LABELS);
                    } else {
                        ensureDropdownValue(block, "STATUS_ID", step.if.statusId, STATUS_LABELS);
                    }
                    if (step.if.statId) block.setFieldValue(step.if.statId, "STAT_ID");
                    if (step.if.value != null) block.setFieldValue(step.if.value, "VALUE");
                    if (typeof block.updateShape_ === "function") block.updateShape_();
                }
                connectNestedSteps(step.then, block, "THEN", workspace);
                connectNestedSteps(step.else, block, "ELSE", workspace);
                break;

            case "repeat": {
                const times = normalizeMinMaxLike(step.times);
                if (times) {
                    block.setFieldValue(times.min, "TIMES_MIN");
                    block.setFieldValue(times.max, "TIMES_MAX");
                }
                connectNestedSteps(step.steps || step.effects, block, "EFFECTS", workspace);
                break;
            }

            case "delay":
                if (step.afterTurns != null) block.setFieldValue(step.afterTurns, "AFTER_TURNS");
                else if (step.turns != null) block.setFieldValue(step.turns, "AFTER_TURNS");
                if (step.target) block.setFieldValue(step.target, "TARGET");
                connectNestedSteps(step.steps || step.effects, block, "EFFECTS", workspace);
                break;

            case "wait":
                if (step.turns != null) block.setFieldValue(step.turns, "TURNS");
                if (step.timing != null) block.setFieldValue(step.timing, "TIMING");
                connectNestedSteps(step.steps || step.effects, block, "EFFECTS", workspace);
                break;

            case "over_time":
                if (step.duration != null) block.setFieldValue(step.duration, "DURATION");
                if (step.target) block.setFieldValue(step.target, "TARGET");
                connectNestedSteps(step.steps || step.effects, block, "EFFECTS", workspace);
                break;

            case "apply_field_status":
                ensureDropdownValue(block, "STATUS_ID", step.statusId, FIELD_STATUS_LABELS);
                if (step.duration != null) block.setFieldValue(step.duration, "DURATION");
                if (step.stack) block.setFieldValue("TRUE", "STACK");
                if (typeof block.updateShape_ === "function") block.updateShape_();
                break;

            case "lock_move":
                if (step.target) block.setFieldValue(step.target, "TARGET");
                if (step.duration != null) block.setFieldValue(step.duration, "DURATION");
                if (step.mode) block.setFieldValue(step.mode, "MODE");
                if (step.data?.mode) block.setFieldValue(step.data.mode, "MODE");
                break;

            case "disable_move":
                if (step.duration != null) block.setFieldValue(step.duration, "DURATION");
                if (step.target) block.setFieldValue(step.target, "TARGET");
                break;

            case "random_move":
                if (step.pool) block.setFieldValue(step.pool, "POOL");
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
        return topBlocks
            .sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y)
            .flatMap((chain) => readBlockChain(chain));
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
        const originalStep = readOriginalStep(block);
        const step = { type: stepType };

        switch (stepType) {
            case "damage":
                step.power = blockToExpression(block.getInputTargetBlock("POWER"));
                step.accuracy = blockToExpression(block.getInputTargetBlock("ACCURACY"));
                if (block.getFieldValue("TARGET") && (hasOwn(originalStep, "target") || block.getFieldValue("TARGET") !== "target")) {
                    step.target = block.getFieldValue("TARGET");
                }
                break;

            case "damage_ratio":
                if (block.getFieldValue("TARGET") && (hasOwn(originalStep, "target") || block.getFieldValue("TARGET") !== "target")) {
                    step.target = block.getFieldValue("TARGET");
                }
                step.ratioMaxHp = block.getFieldValue("RATIO_MAX_HP");
                step.ratioCurrentHp = block.getFieldValue("RATIO_CURRENT_HP");
                break;

            case "ohko":
                step.baseAccuracy = block.getFieldValue("BASE_ACCURACY");
                break;

            case "apply_status":
                if (block.getFieldValue("STATUS_ID")) step.statusId = block.getFieldValue("STATUS_ID");
                if (block.getFieldValue("TARGET") && (hasOwn(originalStep, "target") || block.getFieldValue("TARGET") !== "target")) {
                    step.target = block.getFieldValue("TARGET");
                }
                if (hasOwn(originalStep, "chance") || Number(block.getFieldValue("CHANCE")) !== 1) {
                    step.chance = block.getFieldValue("CHANCE");
                }
                {
                    const durationMin = Number(block.getFieldValue("DURATION_MIN"));
                    const durationMax = Number(block.getFieldValue("DURATION_MAX"));
                    step.duration = buildMinMaxLike(durationMin, durationMax, originalStep?.duration);
                }
                break;

            case "remove_status":
                if (block.getFieldValue("TARGET")) step.target = block.getFieldValue("TARGET");
                if (block.getFieldValue("STATUS_ID")) {
                    step.statusId = block.getFieldValue("STATUS_ID");
                }
                break;

            case "remove_field_status":
                if (block.getFieldValue("STATUS_ID")) step.statusId = block.getFieldValue("STATUS_ID");
                break;

            case "modify_stage": {
                if (block.getFieldValue("TARGET") && (hasOwn(originalStep, "target") || block.getFieldValue("TARGET") !== "target")) {
                    step.target = block.getFieldValue("TARGET");
                }
                if (hasOwn(originalStep, "chance") || Number(block.getFieldValue("CHANCE")) !== 1) {
                    step.chance = block.getFieldValue("CHANCE");
                }
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
                {
                    const condType = block.getFieldValue("COND_TYPE");
                    const statusId = condType === "field_has_status"
                        ? block.getFieldValue("FIELD_STATUS_ID")
                        : block.getFieldValue("STATUS_ID");
                    const statId = block.getFieldValue("STAT_ID");
                    const rawValue = Number(block.getFieldValue("VALUE"));
                    const condition = { type: condType };
                    if (statusId) condition.statusId = statusId;
                    if (statId) condition.statId = statId;
                    if (!Number.isNaN(rawValue) && (condType === "user_hp_ratio_lte" || condType === "target_hp_ratio_lte" || condType === "user_stat_stage_gte" || condType === "target_stat_stage_gte")) {
                        condition.value = rawValue;
                    }
                    step.if = condition;
                }
                step.then = readStatementSteps(block, "THEN");
                step.else = readStatementSteps(block, "ELSE");
                break;

            case "repeat": {
                const timesMin = Number(block.getFieldValue("TIMES_MIN"));
                const timesMax = Number(block.getFieldValue("TIMES_MAX"));
                step.times = buildMinMaxLike(timesMin, timesMax, originalStep?.times);
                step.steps = readStatementSteps(block, "EFFECTS");
                break;
            }

            case "delay":
                if (hasOwn(originalStep, "turns") && !hasOwn(originalStep, "afterTurns")) {
                    step.turns = block.getFieldValue("AFTER_TURNS");
                } else {
                    step.afterTurns = block.getFieldValue("AFTER_TURNS");
                }
                if (block.getFieldValue("TARGET")) step.target = block.getFieldValue("TARGET");
                step.steps = readStatementSteps(block, "EFFECTS");
                break;

            case "over_time":
                if (Number(block.getFieldValue("DURATION")) > 0) {
                    step.duration = Number(block.getFieldValue("DURATION"));
                }
                if (block.getFieldValue("TARGET")) step.target = block.getFieldValue("TARGET");
                step.steps = readStatementSteps(block, "EFFECTS");
                break;

            case "wait":
                step.turns = block.getFieldValue("TURNS");
                if (block.getFieldValue("TIMING")) step.timing = block.getFieldValue("TIMING");
                step.steps = readStatementSteps(block, "EFFECTS");
                break;

            case "apply_field_status":
                if (block.getFieldValue("STATUS_ID")) step.statusId = block.getFieldValue("STATUS_ID");
                if (Number(block.getFieldValue("DURATION")) > 0) {
                    step.duration = Number(block.getFieldValue("DURATION"));
                }
                if (block.getFieldValue("STACK") === "TRUE") step.stack = true;
                break;

            case "force_switch":
            case "self_switch":
                break;

            case "lock_move":
                if (block.getFieldValue("TARGET")) step.target = block.getFieldValue("TARGET");
                step.duration = block.getFieldValue("DURATION");
                {
                    const data = cloneStepValue(originalStep?.data) || {};
                    data.mode = block.getFieldValue("MODE");
                    step.data = pruneEmpty(data);
                }
                break;

            case "disable_move":
                if (Number(block.getFieldValue("DURATION")) > 0) {
                    step.duration = Number(block.getFieldValue("DURATION"));
                } else if (hasOwn(originalStep, "duration")) {
                    step.duration = null;
                }
                if (block.getFieldValue("TARGET")) step.target = block.getFieldValue("TARGET");
                break;

            case "random_move":
                if (block.getFieldValue("POOL")) step.pool = block.getFieldValue("POOL");
                break;

            case "manual": {
                if (originalStep && originalStep.type && originalStep.type !== "manual") {
                    return originalStep;
                }
                const reason = block.getFieldValue("MANUAL_REASON");
                if (reason) step.manualReason = reason;
                break;
            }
        }

        return mergeStepWithOriginal(stepType, originalStep, step);
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
