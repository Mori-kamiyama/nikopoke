const CORE_ORDER = [
  "id",
  "name",
  "type",
  "category",
  "pp",
  "power",
  "accuracy",
  "priority",
  "description",
  "steps",
  "tags",
];

const CORE_KEYS = new Set(CORE_ORDER);
const STEP_FALLBACK = { type: "manual", manualReason: "対応する効果が推定できませんでした" };
const TYPE_OPTIONS = [
  ["", "未設定"],
  ["normal", "ノーマル"],
  ["fire", "ほのお"],
  ["water", "みず"],
  ["electric", "でんき"],
  ["grass", "くさ"],
  ["ice", "こおり"],
  ["fighting", "かくとう"],
  ["poison", "どく"],
  ["ground", "じめん"],
  ["flying", "ひこう"],
  ["psychic", "エスパー"],
  ["bug", "むし"],
  ["rock", "いわ"],
  ["ghost", "ゴースト"],
  ["dragon", "ドラゴン"],
  ["dark", "あく"],
  ["steel", "はがね"],
  ["fairy", "フェアリー"],
];
const CATEGORY_OPTIONS = [
  ["", "未設定"],
  ["physical", "物理"],
  ["special", "特殊"],
  ["status", "変化"],
];
const STEP_TYPE_OPTIONS = [
  ["damage", "ダメージ"],
  ["apply_status", "状態異常付与"],
  ["modify_stage", "能力ランク変化"],
  ["chance", "確率分岐"],
  ["repeat", "繰り返し"],
  ["damage_ratio", "割合ダメージ"],
  ["protect", "まもる"],
  ["apply_field_status", "場の状態付与"],
  ["force_switch", "強制交代"],
  ["self_switch", "自分交代"],
  ["lock_move", "技固定"],
  ["random_move", "ランダム技"],
  ["conditional", "条件分岐"],
  ["ohko", "一撃必殺"],
  ["remove_status", "状態異常回復"],
  ["delay", "遅延発動"],
  ["over_time", "継続効果"],
  ["manual", "手動処理"],
];
const TYPE_LABELS = new Map(TYPE_OPTIONS);
const CATEGORY_LABELS = new Map(CATEGORY_OPTIONS);
const STEP_TYPE_LABELS = new Map(STEP_TYPE_OPTIONS);

const STEP_CATEGORY_MAP = {
  damage: "attack", damage_ratio: "attack", ohko: "attack",
  apply_status: "status", remove_status: "status", modify_stage: "status",
  chance: "flow", conditional: "flow", repeat: "flow", delay: "flow", over_time: "flow",
  apply_field_status: "field", set_weather: "field",
  protect: "special", force_switch: "special", self_switch: "special",
  lock_move: "special", random_move: "special", manual: "special",
};

const STEP_ICON_MAP = {
  damage: "⚔️", damage_ratio: "💥", ohko: "💀",
  apply_status: "🔮", remove_status: "💊", modify_stage: "📊",
  chance: "🎲", conditional: "❓", repeat: "🔄", delay: "⏳", over_time: "⏱️",
  apply_field_status: "🌍", set_weather: "🌤️",
  protect: "🛡️", force_switch: "↩️", self_switch: "🔀",
  lock_move: "🔒", random_move: "🎰", manual: "🔧",
};

const STATUS_OPTIONS = [
  ["burn", "やけど"],
  ["paralysis", "まひ"],
  ["sleep", "ねむり"],
  ["poison", "どく"],
  ["bad_poison", "もうどく"],
  ["freeze", "こおり"],
  ["confusion", "こんらん"],
  ["flinch", "ひるみ"],
  ["yawn", "ねむけ"],
];

const TARGET_OPTIONS = [
  ["target", "相手"],
  ["self", "自分"],
  ["all", "全体"],
];

const STAT_OPTIONS = [
  ["atk", "攻撃"],
  ["def", "防御"],
  ["spa", "特攻"],
  ["spd", "特防"],
  ["spe", "素早さ"],
  ["accuracy", "命中"],
  ["evasion", "回避"],
];

const TAG_OPTIONS = [
  ["contact", "接触"],
  ["sound", "音"],
  ["punch", "パンチ"],
  ["slice", "斬撃"],
  ["bullet", "弾"],
  ["pulse", "波動"],
  ["bite", "牙"],
  ["wind", "風"],
  ["powder", "粉"],
  ["dance", "踊り"],
];

const FIELD_STATUS_OPTIONS = [
  ["sunny", "ひざしがつよい"],
  ["rainy", "あめ"],
  ["sandstorm", "すなあらし"],
  ["snowscape", "ゆき"],
  ["electric_terrain", "エレキフィールド"],
  ["grassy_terrain", "グラスフィールド"],
  ["misty_terrain", "ミストフィールド"],
  ["psychic_terrain", "サイコフィールド"],
  ["stealth_rock", "ステロ"],
  ["spikes", "まきびし"],
  ["toxic_spikes", "どくびし"],
];

const STEP_SCHEMA = {
  damage: {
    fields: [
      { key: "power", label: "威力", type: "number" },
      { key: "accuracy", label: "命中", type: "number", step: 0.1, default: 1.0 },
    ],
  },
  apply_status: {
    fields: [
      { key: "statusId", label: "状態異常", type: "select", options: STATUS_OPTIONS },
      { key: "target", label: "対象", type: "select", options: TARGET_OPTIONS, default: "target" },
      { key: "chance", label: "確率", type: "number", step: 0.1, default: 1.0 },
      { key: "data", label: "追加データ", type: "key_value" },
    ],
  },
  modify_stage: {
    fields: [
      { key: "target", label: "対象", type: "select", options: TARGET_OPTIONS, default: "target" },
      { key: "stages", label: "ランク変化", type: "stages" },
      { key: "chance", label: "確率", type: "number", step: 0.1, default: 1.0 },
    ],
  },
  damage_ratio: {
    fields: [
      { key: "target", label: "対象", type: "select", options: TARGET_OPTIONS, default: "target" },
      { key: "ratioMaxHp", label: "最大HP割合", type: "number", step: 0.05 },
      { key: "ratioCurrentHp", label: "現在HP割合", type: "number", step: 0.05 },
    ],
  },
  chance: {
    fields: [
      { key: "p", label: "成功確率", type: "number", step: 0.1, default: 0.5 },
      { key: "then", label: "成功時のタスク", type: "nested_steps" },
      { key: "else", label: "失敗時のタスク", type: "nested_steps" },
    ],
  },
  repeat: {
    fields: [
      { key: "times", label: "回数", type: "minmax" },
      { key: "effects", label: "繰り返すタスク", type: "nested_steps" },
    ],
  },
  apply_field_status: {
    fields: [
      { key: "statusId", label: "場の状態", type: "select", options: FIELD_STATUS_OPTIONS },
      { key: "target", label: "対象", type: "select", options: [["field", "場"], ...TARGET_OPTIONS], default: "field" },
    ],
  },
  force_switch: {
    fields: [
      { key: "target", label: "対象", type: "select", options: TARGET_OPTIONS, default: "target" },
    ],
  },
  self_switch: {
    fields: [
      { key: "target", label: "対象", type: "select", options: TARGET_OPTIONS, default: "self" },
    ],
  },
  ohko: {
    fields: [
      { key: "baseAccuracy", label: "基本命中", type: "number", step: 0.1, default: 0.3 },
    ],
  },
  remove_status: {
    fields: [
      { key: "target", label: "対象", type: "select", options: TARGET_OPTIONS, default: "self" },
    ],
  },
  delay: {
    fields: [
      { key: "afterTurns", label: "ターン後", type: "number", default: 1 },
      { key: "effects", label: "発動タスク", type: "nested_steps" },
    ],
  },
  over_time: {
    fields: [
      { key: "duration", label: "継続ターン", type: "number", default: 5 },
      { key: "effects", label: "毎ターンのタスク", type: "nested_steps" },
    ],
  },
  protect: {
    fields: [],
  },
  conditional: {
    fields: [
      { key: "if", label: "条件 (JSON)", type: "text" },
      { key: "then", label: "一致時のタスク", type: "nested_steps" },
      { key: "else", label: "不一致時のタスク", type: "nested_steps" },
    ],
  },
};

const state = {
  moves: {},
  moveIds: [],
  selectedId: null,
  completedMoveIds: new Set(),
};

// Check if running on GitHub Pages or static mode
const IS_STATIC = window.location.hostname.includes("github.io") || window.location.search.includes("static=true");

// Supabase Configuration
const SUPABASE_URL = localStorage.getItem("tatuta_supabase_url") || "";
const SUPABASE_ANON_KEY = localStorage.getItem("tatuta_supabase_key") || "";
let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof createClient !== "undefined") {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const el = {
  moveCount: document.getElementById("moveCount"),
  selectedMove: document.getElementById("selectedMove"),
  search: document.getElementById("search"),
  sortBy: document.getElementById("sortBy"),
  moveList: document.getElementById("moveList"),
  moveName: document.getElementById("moveName"),
  moveMeta: document.getElementById("moveMeta"),
  tags: document.getElementById("tags"),
  tagCheckboxes: document.getElementById("tagCheckboxes"),
  moveDescription: document.getElementById("moveDescription"),
  dslEditor: document.getElementById("dslEditor"),
  reloadYaml: document.getElementById("reloadYaml"),
  formatYaml: document.getElementById("formatYaml"),
  saveEdit: document.getElementById("saveEdit"),
  yamlToScratch: document.getElementById("yamlToScratch"),
  scratchToYaml: document.getElementById("scratchToYaml"),
  exportYaml: document.getElementById("exportYaml"),
  markDoneNext: document.getElementById("markDoneNext"),
  doneCount: document.getElementById("doneCount"),
  totalCount: document.getElementById("totalCount"),
  remainingCount: document.getElementById("remainingCount"),
  addExtraField: document.getElementById("addExtraField"),
  extraFields: document.getElementById("extraFields"),
  fName: document.getElementById("fName"),
  fType: document.getElementById("fType"),
  fCategory: document.getElementById("fCategory"),
  fPp: document.getElementById("fPp"),
  fPower: document.getElementById("fPower"),
  fAccuracy: document.getElementById("fAccuracy"),
  fPriority: document.getElementById("fPriority"),
  fTags: document.getElementById("fTags"),
  fDescription: document.getElementById("fDescription"),
  flowScript: document.getElementById("flowScript"),
  flowDiagram: document.getElementById("flowDiagram"),
  studio: document.getElementById("studio"),
  statusLine: document.getElementById("statusLine"),

  // Settings
  openSettings: document.getElementById("openSettings"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettings: document.getElementById("closeSettings"),
  saveSettings: document.getElementById("saveSettings"),
  sUrl: document.getElementById("sUrl"),
  sKey: document.getElementById("sKey"),
};

function toast(message, isError = false) {
  el.statusLine.textContent = message;
  el.statusLine.style.color = isError ? "#a03a1d" : "#245d8a";
}

function optionHtml(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function setSelectOptions(selectEl, options, selectedValue) {
  if (!selectEl) return;
  const hasSelected = options.some(([value]) => value === selectedValue);
  const html = options.map(([value, label]) => optionHtml(value, label, value === selectedValue)).join("");
  if (!hasSelected && selectedValue) {
    selectEl.innerHTML = `${optionHtml(selectedValue, `カスタム: ${selectedValue}`, true)}${html}`;
    return;
  }
  selectEl.innerHTML = html;
}

function formatLabel(map, value) {
  if (!value) return "-";
  return map.get(value) || value;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} の取得に失敗しました: ${res.status}`);
  return res.json();
}

function loadProgress() {
  const saved = localStorage.getItem("tatuta_completed_moves");
  if (saved) {
    try {
      const ids = JSON.parse(saved);
      if (Array.isArray(ids)) state.completedMoveIds = new Set(ids);
    } catch (_) { }
  }
}

function saveProgress() {
  localStorage.setItem("tatuta_completed_moves", JSON.stringify([...state.completedMoveIds]));
}

function updateProgressInfo() {
  const total = state.moveIds.length;
  const done = state.completedMoveIds.size;
  const remaining = total - done;

  if (el.doneCount) el.doneCount.textContent = done;
  if (el.totalCount) el.totalCount.textContent = total;
  if (el.remainingCount) el.remainingCount.textContent = remaining;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      detail = text.slice(0, 100);
    } catch (_) { }
    throw new Error(`${url} の処理に失敗しました: ${res.status} ${detail}`);
  }
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`サーバーが JSON ではなく HTML を返しました。応答冒頭: ${text.slice(0, 50)}`);
  }
  const json = await res.json();
  if (json.ok === false) throw new Error(json.error || `${url} の処理に失敗しました`);
  return json;
}

// Global Move DB for Static Mode
let staticMoveDb = {};

async function refreshMoves() {
  if (supabase) {
    try {
      const { data: moves, error } = await supabase
        .from("moves")
        .select("id, name, type, category, steps, pp, power, accuracy, priority, description, tags, extra_data")
        .order("id");

      if (error) throw error;

      state.moves = {};
      state.moveIds = [];
      moves.forEach((m) => {
        const combined = { ...m, ...m.extra_data };
        delete combined.extra_data;
        state.moves[m.id] = normalizeMoveObject(combined, m.id);
        state.moveIds.push(m.id);
      });
      el.moveCount.textContent = `${moves.length} 件 (Supabase)`;
      return;
    } catch (e) {
      console.error("Supabase load failed:", e);
      toast("Supabase データの読み込みに失敗しました。静的データにフォールバックします。", true);
    }
  }

  if (IS_STATIC) {
    try {
      // Priority: use moves_db.json if available
      const db = await getJson("./moves_db.json");
      staticMoveDb = db;
      state.moves = {};
      state.moveIds = Object.keys(db).sort();
      state.moveIds.forEach(id => {
        state.moves[id] = normalizeMoveObject(db[id].obj, id);
      });
      el.moveCount.textContent = `${state.moveIds.length} 件 (Static)`;
    } catch (e) {
      console.error("Static data load failed:", e);
      state.moves = {};
      state.moveIds = [];
      toast("静的データの読み込みに失敗しました", true);
    }
    return;
  }

  const { moves } = await getJson("/api/moves");
  state.moves = {};
  state.moveIds = [];

  if (Array.isArray(moves)) {
    moves.forEach((m) => {
      state.moves[m.id] = normalizeMoveObject(m);
      state.moveIds.push(m.id);
    });
  } else {
    // If it's an object (id -> move)
    Object.entries(moves).forEach(([id, m]) => {
      state.moves[id] = normalizeMoveObject(m, id);
      state.moveIds.push(id);
    });
  }

  el.moveCount.textContent = `${state.moveIds.length} 件`;
}
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function uniqueStrings(items) {
  const seen = new Set();
  const out = [];
  items.forEach((item) => {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function valueToFieldText(value) {
  if (value === "") return '""';
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseLooseValue(raw) {
  const text = (raw || "").trim();
  if (!text) return undefined;
  if (text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === '""' || text === "''") return "";

  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  return text;
}

function parseNumberOrNull(raw) {
  const text = (raw || "").trim();
  if (!text || text === "null") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseNumberOrDefault(raw, fallback) {
  const n = parseNumberOrNull(raw);
  return n === null ? fallback : n;
}

function normalizeTags(raw) {
  if (Array.isArray(raw)) return uniqueStrings(raw);
  if (typeof raw === "string") return uniqueStrings(raw.split(","));
  return [];
}

function normalizeStep(rawStep, index) {
  if (rawStep && typeof rawStep === "object" && !Array.isArray(rawStep)) {
    const out = {};
    const typeValue = typeof rawStep.type === "string" ? rawStep.type.trim() : "";
    out.type = typeValue || "manual";

    Object.entries(rawStep).forEach(([key, value]) => {
      if (key === "type") return;
      if (value === undefined || value === "") return;
      out[key] = value;
    });
    return out;
  }

  if (typeof rawStep === "string" && rawStep.trim()) {
    return { type: rawStep.trim() };
  }

  return {
    ...STEP_FALLBACK,
    manualReason: `unsupported_step_at_${index + 1}`,
  };
}

function normalizeSteps(rawSteps) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return [{ ...STEP_FALLBACK }];
  }

  const normalized = rawSteps.map((step, index) => normalizeStep(step, index));
  return normalized.length > 0 ? normalized : [{ ...STEP_FALLBACK }];
}

function orderedMoveObject(move) {
  const ordered = {};
  CORE_ORDER.forEach((key) => {
    if (key in move) ordered[key] = move[key];
  });
  Object.keys(move)
    .filter((key) => !CORE_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((key) => {
      ordered[key] = move[key];
    });
  return ordered;
}

function normalizeMoveObject(rawMove, moveId) {
  const source = rawMove && typeof rawMove === "object" ? { ...rawMove } : {};
  const normalized = {
    id: moveId || source.id || state.selectedId,
    name: typeof source.name === "string" ? source.name : "",
    type: typeof source.type === "string" ? source.type : "",
    category: typeof source.category === "string" ? source.category : "",
    pp: source.pp ?? null,
    power: source.power ?? null,
    accuracy: source.accuracy ?? null,
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    description: typeof source.description === "string" ? source.description : "",
    tags: normalizeTags(source.tags),
    steps: normalizeSteps(source.steps),
  };

  Object.entries(source).forEach(([key, value]) => {
    if (CORE_KEYS.has(key)) return;
    normalized[key] = value;
  });

  return orderedMoveObject(normalized);
}

async function yamlToObject(rawYaml) {
  if (IS_STATIC) {
    try {
      if (typeof jsyaml === "undefined") throw new Error("js-yaml library is missing");
      const object = jsyaml.load(rawYaml);
      if (!object || typeof object !== "object") throw new Error("YAML root must be an object");
      return object;
    } catch (e) {
      throw new Error(`YAML Parse Error: ${e.message}`);
    }
  }

  const { object } = await postJson("/api/yaml/parse", { yaml: rawYaml });
  if (!object || typeof object !== "object") throw new Error("YAMLのルートはオブジェクトである必要があります");
  return object;
}

async function objectToYaml(obj) {
  if (IS_STATIC) {
    try {
      if (typeof jsyaml === "undefined") throw new Error("js-yaml library is missing");
      return jsyaml.dump(obj, { indent: 2, noRefs: true, flowLevel: -1 });
    } catch (e) {
      throw new Error(`YAML Dump Error: ${e.message}`);
    }
  }

  const { yaml } = await postJson("/api/yaml/dump", { object: obj });
  return yaml;
}

function fieldRowHtml(key = "", value = "") {
  return `
    <div class="field-row">
      <input class="field-key" placeholder="キー" value="${escapeHtml(key)}" />
      <input class="field-value" placeholder='値' value="${escapeHtml(value)}" />
      <button class="icon-btn" data-action="remove-field">削除</button>
    </div>
  `;
}

function schemaFieldInputHtml(field, value) {
  const val = value ?? field.default;

  if (field.type === "select") {
    const options = field.options || [];
    const selectHtml = `<select class="schema-value" data-key="${field.key}">
      ${optionHtml("", "-- 選択 --", val === undefined || val === null)}
      ${options.map(([v, label]) => optionHtml(v, label, String(v) === String(val))).join("")}
    </select>`;
    return selectHtml;
  }

  if (field.type === "number") {
    const listId = `list-${field.key}-${Math.random().toString(36).slice(2)}`;
    let datalist = "";
    if (field.key === "ratioMaxHp" || field.key === "ratioCurrentHp") {
      datalist = `<datalist id="${listId}">
        <option value="0.5">50% (0.5)</option>
        <option value="0.25">25% (0.25)</option>
        <option value="0.125">12.5% (0.125)</option>
        <option value="1.0">100% (1.0)</option>
        <option value="-0.5">回復 50% (-0.5)</option>
        <option value="-1.0">全回復 (-1.0)</option>
      </datalist>`;
    } else if (field.key === "chance" || field.key === "p" || field.key === "accuracy") {
      datalist = `<datalist id="${listId}">
        <option value="1.0">100%</option>
        <option value="0.5">50%</option>
        <option value="0.3">30%</option>
        <option value="0.1">10%</option>
      </datalist>`;
    }
    return `
      <input type="number" class="schema-value" data-key="${field.key}" step="${field.step || 1}" value="${val ?? ""}" placeholder="${field.label}" list="${listId}" />
      ${datalist}
    `;
  }

  if (field.type === "stages") {
    const stages = val || {};
    return `
      <div class="stages-editor schema-value-group" data-key="${field.key}">
        ${STAT_OPTIONS.map(([id, label]) => `
          <div class="stage-item">
            <span class="tiny">${label}</span>
            <input type="number" data-stat="${id}" value="${stages[id] ?? ""}" min="-6" max="6" step="1" />
          </div>
        `).join("")}
      </div>
    `;
  }

  if (field.type === "minmax") {
    const minmax = val || {};
    return `
      <div class="minmax-editor schema-value-group" data-key="${field.key}">
        <input type="number" data-part="min" value="${minmax.min ?? ""}" placeholder="最小" />
        <span>〜</span>
        <input type="number" data-part="max" value="${minmax.max ?? ""}" placeholder="最大" />
      </div>
    `;
  }

  if (field.type === "key_value") {
    const obj = val || {};
    const rows = Object.entries(obj).map(([k, v]) => `
      <div class="kv-row">
        <input class="kv-key" placeholder="key" value="${escapeHtml(k)}" />
        <input class="kv-value" placeholder="value" value="${escapeHtml(v)}" />
        <button class="icon-btn" data-action="remove-kv">×</button>
      </div>
    `).join("");
    return `
      <div class="kv-editor schema-value-group" data-key="${field.key}">
        <div class="kv-rows">${rows}</div>
        <button class="icon-btn tiny" data-action="add-kv">+ 追加</button>
      </div>
    `;
  }

  if (field.type === "nested_steps") {
    const steps = normalizeSteps(val || []);
    const isMainSteps = !val;
    const slotIcon = field.key === "then" ? "✅" : field.key === "else" ? "❌" : "🔁";
    return `
      <div class="nested-steps-container schema-value-group" data-key="${field.key}">
        <div class="nest-slot-label">
          <span class="nest-icon">${slotIcon}</span>
          ${escapeHtml(field.label)}
        </div>
        <div class="nested-steps-list">
          ${steps.map((s, i) => stepCard(s, i).outerHTML).join("")}
        </div>
        <div class="nested-actions">
          <button class="btn tiny ghost" data-action="add-nested-step">+ タスク追加</button>
        </div>
      </div>
    `;
  }

  return `<input type="text" class="schema-value" data-key="${field.key}" value="${escapeHtml(val ?? "")}" placeholder="${field.label}" />`;
}

function schemaFieldRowHtml(field, value) {
  return `
    <div class="schema-field-row">
      <label class="field-label">${escapeHtml(field.label)}</label>
      <div class="field-input-wrap">
        ${schemaFieldInputHtml(field, value)}
      </div>
    </div>
  `;
}

function stepCard(step = { ...STEP_FALLBACK }, index = 0) {
  const card = document.createElement("div");
  card.className = "step-card";
  const stepType = typeof step.type === "string" ? step.type : "manual";
  card.setAttribute("data-step-type", stepType);
  const schema = STEP_SCHEMA[stepType];

  const usedKeys = new Set(["type"]);
  let schemaRows = "";
  if (schema) {
    schemaRows = schema.fields.map(f => {
      usedKeys.add(f.key);
      return schemaFieldRowHtml(f, step[f.key]);
    }).join("");
  }

  // Handle nested 'data' or any other extra fields
  const extraRows = Object.entries(step)
    .filter(([key]) => !usedKeys.has(key))
    .map(([key, value]) => fieldRowHtml(key, valueToFieldText(value)))
    .join("");

  const stepTypeSelect = `<select class="step-type">${STEP_TYPE_OPTIONS.map(([value, label]) =>
    optionHtml(value, label, value === stepType)
  ).join("")}</select>`;
  const selectWithCustom =
    STEP_TYPE_LABELS.has(stepType) || !stepType
      ? stepTypeSelect
      : `<select class="step-type">${optionHtml(stepType, `カスタム: ${stepType}`, true)}${STEP_TYPE_OPTIONS.map(
        ([value, label]) => optionHtml(value, label, false)
      ).join("")}</select>`;

  const icon = STEP_ICON_MAP[stepType] || "🔧";
  card.innerHTML = `
    <div class="step-top">
      <span class="step-drag-handle" title="ドラッグで並べ替え">⠿</span>
      <span class="step-no">${icon} ${index + 1}</span>
      ${selectWithCustom}
      <div class="step-toolbar">
        <button class="icon-btn" data-action="move-up">↑</button>
        <button class="icon-btn" data-action="move-down">↓</button>
        <button class="icon-btn" data-action="duplicate-step">複製</button>
        <button class="icon-btn" data-action="remove-step">削除</button>
      </div>
    </div>
    <div class="step-schema-fields">${schemaRows}</div>
    <div class="step-fields" style="${extraRows ? "" : "display:none"}">${extraRows}</div>
    <div class="editor-actions">
      <button class="icon-btn" data-action="add-field">+ 独自パラメータ追加</button>
    </div>
  `;

  return card;
}

function getVisibleMoveIds() {
  const query = el.search.value.trim().toLowerCase();
  const sortBy = el.sortBy.value;

  const filtered = state.moveIds.filter((id) => {
    const move = state.moves[id];
    const text = `${id} ${String(move?.name || "").toLowerCase()}`;
    return !query || text.includes(query);
  });

  filtered.sort((a, b) => {
    const moveA = state.moves[a] || {};
    const moveB = state.moves[b] || {};

    if (sortBy === "name") {
      return String(moveA.name || a).localeCompare(String(moveB.name || b), "ja");
    }
    if (sortBy === "type") {
      const typeA = String(moveA.type || "");
      const typeB = String(moveB.type || "");
      return typeA === typeB ? a.localeCompare(b) : typeA.localeCompare(typeB);
    }
    return a.localeCompare(b);
  });

  return filtered;
}

function renderList() {
  const ids = getVisibleMoveIds();
  el.moveList.innerHTML = "";

  ids.forEach((id) => {
    const move = state.moves[id];
    const isDone = state.completedMoveIds.has(id);
    const item = document.createElement("div");
    item.className = `move-item${id === state.selectedId ? " active" : ""}${isDone ? " done" : ""}`;
    item.innerHTML = `
      <div class="row">
        <strong>${escapeHtml(move.name || id)}</strong>
        <span class="tiny">${escapeHtml(id)}</span>
        ${isDone ? '<span class="done-mark" style="margin-left:auto">✅</span>' : ""}
      </div>
      <div class="row tiny">
        <span>${escapeHtml(formatLabel(TYPE_LABELS, move.type))} / ${escapeHtml(formatLabel(CATEGORY_LABELS, move.category))}</span>
        <span>ステップ: ${Array.isArray(move.steps) ? move.steps.length : 0}</span>
      </div>
    `;

    item.onclick = () => {
      selectMove(id).catch((error) => toast(error.message, true));
    };

    el.moveList.appendChild(item);
  });

  updateProgressInfo();
}

function updateMeta() {
  el.moveCount.textContent = `${state.moveIds.length} 件`;
  el.selectedMove.textContent = state.selectedId ? `選択中: ${state.selectedId}` : "-- 選択中";
}

function fillTopLevel(move) {
  el.fName.value = move.name || "";
  setSelectOptions(el.fType, TYPE_OPTIONS, move.type || "");
  setSelectOptions(el.fCategory, CATEGORY_OPTIONS, move.category || "");
  el.fPp.value = move.pp ?? "";
  el.fPower.value = move.power ?? "";
  el.fAccuracy.value = move.accuracy ?? "";
  el.fPriority.value = move.priority ?? 0;

  const moveTags = Array.isArray(move.tags) ? move.tags : [];
  const knownTags = new Set(TAG_OPTIONS.map(([id]) => id));

  el.tagCheckboxes.innerHTML = TAG_OPTIONS.map(([id, label]) => `
    <label class="tag-cb"><input type="checkbox" value="${id}" ${moveTags.includes(id) ? "checked" : ""} />${label}</label>
  `).join("");

  const customTags = moveTags.filter(t => !knownTags.has(t));
  el.fTags.value = customTags.join(", ");
  el.fDescription.value = move.description || "";
}

function topLevelFromGui() {
  const selectedTags = Array.from(el.tagCheckboxes.querySelectorAll("input:checked")).map(cb => cb.value);
  const customTags = normalizeTags(el.fTags.value);
  const tags = uniqueStrings([...selectedTags, ...customTags]);

  return {
    id: state.selectedId,
    name: el.fName.value.trim(),
    type: el.fType.value.trim(),
    category: el.fCategory.value.trim(),
    pp: parseNumberOrNull(el.fPp.value),
    power: parseNumberOrNull(el.fPower.value),
    accuracy: parseNumberOrNull(el.fAccuracy.value),
    priority: parseNumberOrDefault(el.fPriority.value, 0),
    description: el.fDescription.value,
    tags: tags,
  };
}


function fillExtraFields(move) {
  el.extraFields.innerHTML = "";
  Object.keys(move)
    .filter((key) => !CORE_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((key) => {
      el.extraFields.insertAdjacentHTML("beforeend", fieldRowHtml(key, valueToFieldText(move[key])));
    });
}

function refreshStepNumbers() {
  const cards = Array.from(el.stepsEditor.querySelectorAll(".step-card"));
  cards.forEach((card, index) => {
    const badge = card.querySelector(".step-no");
    if (badge) badge.textContent = String(index + 1);
  });
}

function fillSteps(move) {
  const ws = TatutaBlockly.getWorkspace();
  if (!ws) return;
  const steps = normalizeSteps(move.steps);
  TatutaBlockly.stepsToBlocks(steps, ws);
}

function fillScratch(rawMove) {
  const move = normalizeMoveObject(rawMove, state.selectedId);
  fillTopLevel(move);
  fillExtraFields(move);
  fillSteps(move);
  renderFlowScript(move);
}

function readExtraFields() {
  const out = {};
  const rows = Array.from(el.extraFields.querySelectorAll(".field-row"));

  rows.forEach((row) => {
    const key = row.querySelector(".field-key")?.value.trim();
    if (!key || CORE_KEYS.has(key)) return;
    const rawValue = row.querySelector(".field-value")?.value ?? "";
    const value = parseLooseValue(rawValue);
    if (value === undefined) return;
    out[key] = value;
  });

  return out;
}

function readStepFromCard(card) {
  const out = { type: card.querySelector(".step-type")?.value.trim() || "manual" };

  // Read schema-defined fields
  const schemaInputs = Array.from(card.querySelectorAll(":scope > .step-schema-fields .schema-value, :scope > .step-schema-fields .schema-value-group"));
  schemaInputs.forEach(input => {
    const key = input.dataset.key;
    if (!key) return;

    if (input.classList.contains("stages-editor")) {
      const stages = {};
      input.querySelectorAll("input").forEach(i => {
        const val = i.value.trim();
        if (val) stages[i.dataset.stat] = Number(val);
      });
      if (Object.keys(stages).length > 0) out[key] = stages;
    } else if (input.classList.contains("minmax-editor")) {
      const min = input.querySelector('[data-part="min"]').value.trim();
      const max = input.querySelector('[data-part="max"]').value.trim();
      if (min || max) {
        out[key] = {
          min: min ? Number(min) : undefined,
          max: max ? Number(max) : undefined
        };
      }
    } else if (input.classList.contains("kv-editor")) {
      const obj = {};
      input.querySelectorAll(".kv-row").forEach(row => {
        const k = row.querySelector(".kv-key").value.trim();
        const v = row.querySelector(".kv-value").value.trim();
        if (k) obj[k] = parseLooseValue(v);
      });
      if (Object.keys(obj).length > 0) out[key] = obj;
    } else if (input.classList.contains("nested-steps-container")) {
      const nestedCards = Array.from(input.querySelectorAll(":scope > .nested-steps-list > .step-card"));
      const nestedSteps = nestedCards.map((nc, ni) => normalizeStep(readStepFromCard(nc), ni));
      if (nestedSteps.length > 0) out[key] = nestedSteps;
    } else {
      const val = input.value.trim();
      out[key] = parseLooseValue(val);
    }
  });

  // Read extra fields
  const rows = Array.from(card.querySelectorAll(":scope > .step-fields .field-row"));
  rows.forEach((row) => {
    const key = row.querySelector(".field-key")?.value.trim();
    if (!key || key === "type") return;
    const rawValue = row.querySelector(".field-value")?.value ?? "";
    const value = parseLooseValue(rawValue);
    if (value === undefined) return;
    out[key] = value;
  });

  return out;
}

function readSteps() {
  const ws = TatutaBlockly.getWorkspace();
  if (!ws) return [{ type: "manual" }];
  return TatutaBlockly.blocksToSteps(ws);
}

function scratchToObject() {
  const top = topLevelFromGui();
  const extras = readExtraFields();
  const steps = readSteps();
  return orderedMoveObject({ ...top, ...extras, steps });
}

function escapeMermaidLabel(text) {
  return String(text || "").replaceAll('"', "'").replaceAll("\n", " ");
}

function stepSummary(step) {
  if (step.type === "chance") {
    return `確率分岐 (${step.p || 0.5})`;
  }
  if (step.type === "conditional") {
    return `条件分岐 (${step.if ? "あり" : "なし"})`;
  }
  if (step.type === "repeat") {
    const t = step.times || {};
    return `繰り返し (${t.min || "?"}〜${t.max || "?"}回)`;
  }
  if (step.type === "delay") {
    return `ディレイ (${step.afterTurns || 1}T後)`;
  }
  if (step.type === "over_time") {
    return `継続 (${step.duration || 5}T)`;
  }

  const details = Object.entries(step)
    .filter(([key, value]) => key !== "type" && typeof value !== "object")
    .slice(0, 2)
    .map(([key, value]) => {
      const printable = typeof value === "object" ? "..." : String(value);
      return `${key}:${printable}`;
    });

  const suffix = details.length > 0 ? ` | ${details.join(" | ")}` : "";
  return `${formatLabel(STEP_TYPE_LABELS, step.type)}${suffix}`;
}

function generateFlowScript(move) {
  const title = move.name || move.id || "技";
  const lines = ["flowchart LR", `M[\"${escapeMermaidLabel(title)}\"]`];

  let nodeCount = 0;

  function processSteps(steps, parentId, levelPrefix) {
    let lastId = parentId;
    steps.forEach((step, index) => {
      nodeCount++;
      const id = `${levelPrefix}_${index}_${nodeCount}`;
      const summary = stepSummary(step);
      lines.push(`${id}[\"${escapeMermaidLabel(`${index + 1}. ${summary}`)}\"]`);
      lines.push(`${lastId} --> ${id}`);

      // Handle nesting for Mermaid
      if (step.type === "chance") {
        if (step.then && step.then.length > 0) {
          const thenId = `${id}_then`;
          lines.push(`${id} -- 成功 --> ${thenId}{ }`);
          processSteps(step.then, thenId, `${id}T`);
        }
        if (step.else && step.else.length > 0) {
          const elseId = `${id}_else`;
          lines.push(`${id} -- 失敗 --> ${elseId}{ }`);
          processSteps(step.else, elseId, `${id}E`);
        }
      } else if (step.type === "conditional") {
        if (step.then && step.then.length > 0) {
          const thenId = `${id}_then`;
          lines.push(`${id} -- 一致 --> ${thenId}{ }`);
          processSteps(step.then, thenId, `${id}T`);
        }
        if (step.else && step.else.length > 0) {
          const elseId = `${id}_else`;
          lines.push(`${id} -- 不一致 --> ${elseId}{ }`);
          processSteps(step.else, elseId, `${id}E`);
        }
      } else if (step.type === "repeat") {
        if (step.effects && step.effects.length > 0) {
          const repeatId = `${id}_rep`;
          lines.push(`${id} -- 繰り返し --> ${repeatId}{ }`);
          processSteps(step.effects, repeatId, `${id}R`);
        }
      } else if (step.type === "delay") {
        if (step.effects && step.effects.length > 0) {
          const delayId = `${id}_del`;
          lines.push(`${id} -- 遅延発動 --> ${delayId}{ }`);
          processSteps(step.effects, delayId, `${id}D`);
        }
      } else if (step.type === "over_time") {
        if (step.effects && step.effects.length > 0) {
          const overId = `${id}_over`;
          lines.push(`${id} -- 毎ターン実行 --> ${overId}{ }`);
          processSteps(step.effects, overId, `${id}O`);
        }
      }

      lastId = id;
    });
  }

  const rootSteps = normalizeSteps(move.steps);
  processSteps(rootSteps, "M", "S");

  return lines.join("\n");
}

let mermaidRenderCounter = 0;

async function renderMermaidDiagram(script) {
  if (!el.flowDiagram || typeof mermaid === "undefined") return;
  try {
    mermaidRenderCounter++;
    const id = `mermaid_${mermaidRenderCounter}`;
    const { svg } = await mermaid.render(id, script);
    el.flowDiagram.innerHTML = svg;
  } catch (e) {
    el.flowDiagram.innerHTML = `<p class="tiny" style="color:#a03a1d">フロー図の描画に失敗しました</p>`;
  }
}

function renderFlowScript(move) {
  const script = generateFlowScript(move);
  el.flowScript.textContent = script;
  renderMermaidDiagram(script);
}

function refreshFlowPreviewFromGui() {
  if (!state.selectedId) return;
  const move = scratchToObject();
  // Auto-save to state
  state.moves[state.selectedId] = move;
  renderFlowScript(move);
}

function renderMoveSummary(move, moveId) {
  el.moveName.textContent = move.name || moveId;
  el.moveMeta.textContent = `${moveId} | ${formatLabel(TYPE_LABELS, move.type)} | ${formatLabel(CATEGORY_LABELS, move.category)} | PP ${move.pp ?? "-"} | 優先度 ${move.priority ?? 0}`;
  el.moveDescription.textContent = move.description || "(説明なし)";
  el.tags.innerHTML = "";

  (move.tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    el.tags.appendChild(chip);
  });
}

async function loadYaml(moveId) {
  if (IS_STATIC) {
    // In static mode, retrieve raw YAML from our preloaded DB
    if (staticMoveDb[moveId] && staticMoveDb[moveId].yaml) {
      return { yaml: staticMoveDb[moveId].yaml };
    }
    // Fallback: generate from current object
    const move = state.moves[moveId];
    const yaml = await objectToYaml(move);
    return { yaml };
  }

  const { yaml } = await getJson(`/api/move-yaml?moveId=${encodeURIComponent(moveId)}`);
  return { yaml };
}

async function selectMove(moveId) {
  state.selectedId = moveId;
  const move = normalizeMoveObject(state.moves[moveId], moveId);

  renderMoveSummary(move, moveId);
  const { yaml } = await loadYaml(moveId);
  el.dslEditor.value = yaml;
  fillScratch(move);
  updateMeta();
  renderList();
}

// Duplicate refreshMoves removed

async function doYamlToGui() {
  if (!state.selectedId) return;
  const parsed = await yamlToObject(el.dslEditor.value);
  const move = normalizeMoveObject(parsed, state.selectedId);
  fillScratch(move);
  toast(`YAML → GUI 完了 (ステップ: ${move.steps.length})`);
}

async function doGuiToYaml(silent = false) {
  if (!state.selectedId) return;
  const move = scratchToObject();
  const yaml = await objectToYaml(move);
  el.dslEditor.value = yaml;
  renderFlowScript(move);
  const extraCount = Object.keys(move).filter((key) => !CORE_KEYS.has(key)).length;
  if (!silent) {
    toast(`GUI → YAML 完了 (ステップ: ${move.steps.length}, 追加項目: ${extraCount})`);
  }
}

async function formatYaml() {
  if (!state.selectedId) return;
  const parsed = await yamlToObject(el.dslEditor.value);
  const move = normalizeMoveObject(parsed, state.selectedId);
  el.dslEditor.value = await objectToYaml(move);
  fillScratch(move);
  toast("YAML整形完了");
}

async function saveYaml() {
  if (!state.selectedId) return;

  if (supabase) {
    try {
      const parsed = await yamlToObject(el.dslEditor.value);
      const move = normalizeMoveObject(parsed, state.selectedId);

      const CORE_KEYS = new Set(["id", "name", "type", "category", "pp", "power", "accuracy", "priority", "description", "tags", "steps"]);
      const extra_data = {};
      const base_data = {};

      Object.entries(move).forEach(([k, v]) => {
        if (CORE_KEYS.has(k)) {
          base_data[k] = v;
        } else {
          extra_data[k] = v;
        }
      });

      const { error } = await supabase
        .from("moves")
        .upsert({ ...base_data, extra_data });

      if (error) throw error;

      await refreshMoves();
      await selectMove(state.selectedId);
      toast(`Supabase に保存しました: ${move.id}`);
      return;
    } catch (e) {
      console.error("Supabase save failed:", e);
      toast(`Supabase 保存失敗: ${e.message}`, true);
      return;
    }
  }

  const result = await postJson("/api/moves/update", { moveId: state.selectedId, yaml: el.dslEditor.value });
  await refreshMoves();
  await selectMove(state.selectedId);
  toast(`サーバーに送信完了: ${result.moveId}`);
}

function handleFieldContainerClick(event, container) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.dataset.action;

  if (action === "remove-field") {
    target.closest(".field-row")?.remove();
    refreshFlowPreviewFromGui();
    return;
  }

  if (action === "remove-kv") {
    target.closest(".kv-row")?.remove();
    refreshFlowPreviewFromGui();
    return;
  }

  if (action === "add-kv") {
    const editor = target.closest(".kv-editor");
    editor.querySelector(".kv-rows").insertAdjacentHTML("beforeend", `
      <div class="kv-row">
        <input class="kv-key" placeholder="key" />
        <input class="kv-value" placeholder="value" />
        <button class="icon-btn" data-action="remove-kv">×</button>
      </div>
    `);
    return;
  }

  const card = target.closest(".step-card");
  if (!card) return;

  if (action === "add-field") {
    card.querySelector(":scope > .step-fields")?.insertAdjacentHTML("beforeend", fieldRowHtml());
  } else if (action === "add-nested-step") {
    const nestedList = target.closest(".nested-steps-container")?.querySelector(":scope > .nested-steps-list");
    if (nestedList) {
      const index = nestedList.children.length;
      const newCard = stepCard({ type: "manual" }, index);
      nestedList.appendChild(newCard);
      if (typeof initSortableOnCard === "function") initSortableOnCard(newCard);
      refreshStepNumbers();
    }
  } else if (action === "remove-step") {
    const parentList = card.parentElement;
    card.remove();
    if (parentList && parentList.id === "stepsEditor" && !parentList.querySelector(".step-card")) {
      parentList.appendChild(stepCard({ ...STEP_FALLBACK }, 0));
    }
  } else if (action === "duplicate-step") {
    const cloned = card.cloneNode(true);
    card.insertAdjacentElement("afterend", cloned);
    if (typeof initSortableOnCard === "function") initSortableOnCard(cloned);
  } else if (action === "move-up") {
    const prev = card.previousElementSibling;
    if (prev) card.parentElement?.insertBefore(card, prev);
  } else if (action === "move-down") {
    const next = card.nextElementSibling;
    if (next) card.parentElement?.insertBefore(next, card);
  }

  refreshStepNumbers();
  refreshFlowPreviewFromGui();
}

function markAsDoneAndNext() {
  if (!state.selectedId) return;

  // Mark current as done
  state.completedMoveIds.add(state.selectedId);
  saveProgress();
  renderList();

  // Find next move in current filtered list
  const ids = getVisibleMoveIds();
  const currentIndex = ids.indexOf(state.selectedId);
  let nextId = null;

  if (currentIndex !== -1 && currentIndex < ids.length - 1) {
    nextId = ids[currentIndex + 1];
  }

  if (nextId) {
    selectMove(nextId).catch(err => toast(err.message, true));
    toast(`完了！次の技を表示します: ${nextId}`);
  } else {
    toast("すべての技の編集が完了しました！");
  }
}

async function exportAllMovesToYaml() {
  try {
    toast("エクスポート中...");

    // Convert all moves to a single YAML document or map
    // The backend /api/yaml/dump might handle a large object
    const { yaml } = await postJson("/api/yaml/dump", { object: state.moves });

    // Download as file
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "moves_updated.yaml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast("YAMLをエクスポートしました。");
  } catch (error) {
    toast(`エクスポート失敗: ${error.message}`, true);
  }
}

function bindFlowAutoPreview() {
  [
    el.fName,
    el.fType,
    el.fCategory,
    el.fPp,
    el.fPower,
    el.fAccuracy,
    el.fPriority,
    el.fTags,
    el.fDescription,
  ].forEach((field) => {
    field?.addEventListener("input", refreshFlowPreviewFromGui);
  });

  el.extraFields.addEventListener("input", refreshFlowPreviewFromGui);
}

function setupLocalizedSelects() {
  setSelectOptions(el.fType, TYPE_OPTIONS, "");
  setSelectOptions(el.fCategory, CATEGORY_OPTIONS, "");
}

async function bootstrap() {
  try {
    loadProgress();
    await refreshMoves();
    updateMeta();
    renderList();

    if (state.moveIds[0]) {
      await selectMove(state.moveIds[0]);
    }

    toast("技データを読み込みました。");
  } catch (error) {
    toast(`初期化失敗: ${error.message}`, true);
  }
}

el.search.addEventListener("input", renderList);
el.sortBy.addEventListener("change", renderList);

el.reloadYaml.addEventListener("click", () => {
  if (!state.selectedId) return;
  loadYaml(state.selectedId)
    .then(() => toast("再読込完了"))
    .catch((error) => toast(error.message, true));
});

let autoSyncTimer = null;
function debouncedSyncGuiToYaml() {
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    doGuiToYaml(true).catch(err => console.error("Auto-sync failed:", err));
  }, 1000);
}

el.studio.addEventListener("input", (e) => {
  if (e.target.closest(".dsl-editor")) return; // Don't sync when typing in YAML editor itself
  debouncedSyncGuiToYaml();
});

el.studio.addEventListener("change", (e) => {
  debouncedSyncGuiToYaml();
});

el.yamlToScratch.addEventListener("click", () => {
  doYamlToGui().catch((error) => toast(error.message, true));
});

el.scratchToYaml.addEventListener("click", () => {
  doGuiToYaml().catch((error) => toast(error.message, true));
});

el.formatYaml.addEventListener("click", () => {
  formatYaml().catch((error) => toast(error.message, true));
});

el.saveEdit.addEventListener("click", () => {
  saveYaml().catch((error) => toast(error.message, true));
});


el.addExtraField.addEventListener("click", () => {
  el.extraFields.insertAdjacentHTML("beforeend", fieldRowHtml());
});

el.extraFields.addEventListener("click", (event) => handleFieldContainerClick(event, el.extraFields));

el.dslEditor.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveYaml().catch((error) => toast(error.message, true));
  }
});

el.markDoneNext?.addEventListener("click", markAsDoneAndNext);
el.exportYaml?.addEventListener("click", exportAllMovesToYaml);

// Settings
el.openSettings.addEventListener("click", () => {
  el.sUrl.value = localStorage.getItem("tatuta_supabase_url") || "";
  el.sKey.value = localStorage.getItem("tatuta_supabase_key") || "";
  el.settingsModal.style.display = "flex";
});

el.closeSettings.addEventListener("click", () => {
  el.settingsModal.style.display = "none";
});

el.settingsModal.addEventListener("click", (e) => {
  if (e.target === el.settingsModal) el.settingsModal.style.display = "none";
});

el.saveSettings.addEventListener("click", () => {
  localStorage.setItem("tatuta_supabase_url", el.sUrl.value.trim());
  localStorage.setItem("tatuta_supabase_key", el.sKey.value.trim());
  location.reload(); // Quickest way to re-init everything
});

// ========================================
// MERMAID INIT
// ========================================

if (typeof mermaid !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    flowchart: { curve: "basis", padding: 12 },
    securityLevel: "loose",
  });
}

// ========================================
// BLOCKLY WORKSPACE INIT & BOOTSTRAP
// ========================================

bindFlowAutoPreview();
setupLocalizedSelects();

const blocklyWorkspace = TatutaBlockly.injectWorkspace("blocklyDiv", () => {
  // On any block change → refresh Mermaid preview and sync YAML
  refreshFlowPreviewFromGui();
  debouncedSyncGuiToYaml();
});

bootstrap();

