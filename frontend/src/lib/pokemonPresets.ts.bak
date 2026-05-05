import type { EVStats, MoveData } from '../types/pokemon';

export type PokemonPreset = {
    itemId?: string;
    nature?: {
        name: string;
        increased: keyof EVStats;
        decreased: keyof EVStats;
    };
    evs: EVStats;
    moveNames: string[];
};

const createEvs = (evs: Partial<EVStats>): EVStats => ({
    hp: 0,
    atk: 0,
    def: 0,
    spa: 0,
    spd: 0,
    spe: 0,
    ...evs,
});

const MODEST = { name: 'ひかえめ', increased: 'spa', decreased: 'atk' } as const;
const TIMID = { name: 'おくびょう', increased: 'spe', decreased: 'atk' } as const;
const ADAMANT = { name: 'いじっぱり', increased: 'atk', decreased: 'spa' } as const;
const JOLLY = { name: 'ようき', increased: 'spe', decreased: 'spa' } as const;

export const POKEMON_PRESETS: Record<string, PokemonPreset> = {
    eiraku: {
        itemId: 'choiceSpecs',
        nature: MODEST,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['ハイドロポンプ', 'ばくおんぱ', 'はどうだん', 'フレアソング'],
    },
    tatuta: {
        itemId: 'choiceScarf',
        nature: TIMID,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['リーフストーム', 'りゅうせいぐん', 'フレアソング', 'きのこのほうし'],
    },
    morimitu: {
        itemId: 'lifeOrb',
        nature: TIMID,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['オーバーヒート', 'エアスラッシュ', '10まんボルト', 'ムーンフォース'],
    },
    takaho: {
        itemId: 'assaultVest',
        nature: ADAMANT,
        evs: createEvs({ hp: 252, atk: 252, spd: 4 }),
        moveNames: ['ウッドホーン', 'とんぼがえり', 'みきり', 'アクセルロック'],
    },
    ume: {
        itemId: 'choiceSpecs',
        nature: MODEST,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['おにび', '10まんボルト', 'ボルトチェンジ', 'たたりめ'],
    },
    machida: {
        itemId: 'choiceBand',
        nature: JOLLY,
        evs: createEvs({ atk: 252, spe: 252, hp: 4 }),
        moveNames: ['じしん', 'アクアブレイク', 'クイックターン', 'かえんボール'],
    },
    touma: {
        itemId: 'choiceScarf',
        nature: JOLLY,
        evs: createEvs({ atk: 252, spe: 252, hp: 4 }),
        moveNames: ['インファイト', 'はたきおとす', 'つるぎのまい', 'ふいうち'],
    },
    morimori: {
        itemId: 'assaultVest',
        nature: ADAMANT,
        evs: createEvs({ hp: 252, atk: 252, def: 4 }),
        moveNames: ['じしん', 'ねむる', 'ボディプレス', 'てっぺき'],
    },
    ayuma: {
        itemId: 'lifeOrb',
        nature: TIMID,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['わるだくみ', 'あくのはどう', 'ラスターカノン', 'はどうだん'],
    },
    buchii: {
        itemId: 'assaultVest',
        nature: MODEST,
        evs: createEvs({ hp: 252, def: 252, spd: 4 }),
        moveNames: ['ムーンフォース', 'むしのさざめき', 'サイコショック', 'ちょうのまい'],
    },
    tomoki: {
        itemId: 'choiceSpecs',
        nature: TIMID,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['れいとうビーム', 'ぼうふう', '10まんボルト', 'かえんほうしゃ'],
    },
    haruta: {
        itemId: 'choiceBand',
        nature: JOLLY,
        evs: createEvs({ atk: 252, spe: 252, hp: 4 }),
        moveNames: ['しんそく', 'じゃれつく', 'かえんボール', 'まもる'],
    },
    macchan: {
        itemId: 'choiceBand',
        nature: JOLLY,
        evs: createEvs({ atk: 252, spe: 252, hp: 4 }),
        moveNames: ['インファイト', 'バレットパンチ', 'コメットパンチ', 'りゅうのまい'],
    },
    michii: {
        itemId: 'choiceSpecs',
        nature: TIMID,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['サイコキネシス', 'あくのはどう', '10まんボルト', 'わるだくみ'],
    },
    nisiki: {
        itemId: 'focusSash',
        nature: TIMID,
        evs: createEvs({ spa: 252, spe: 252, def: 4 }),
        moveNames: ['シャドーレイ', 'サイコキネシス', 'フリーズドライ', 'おにび'],
    },
    sena: {
        itemId: 'choiceBand',
        nature: ADAMANT,
        evs: createEvs({ hp: 252, atk: 252, spd: 4 }),
        moveNames: ['であいがしら', 'ボルテッカー', 'アイアンヘッド', 'ぶちかまし'],
    },
    ikkun: {
        itemId: 'assaultVest',
        nature: ADAMANT,
        evs: createEvs({ hp: 252, def: 252, spd: 4 }),
        moveNames: ['アクセルロック', 'みがわり', 'どくどく', 'まもる'],
    },
    futo: {
        itemId: 'choiceScarf',
        nature: JOLLY,
        evs: createEvs({ atk: 252, spe: 252, hp: 4 }),
        moveNames: ['せいなるほのお', 'フレアドライブ', 'メガホーン', 'とんぼがえり'],
    },
    makocchan: {
        itemId: 'lifeOrb',
        nature: MODEST,
        evs: createEvs({ hp: 252, spa: 252, spd: 4 }),
        moveNames: ['ムーンフォース', 'サイコキネシス', 'めいそう', 'マジカルフレイム'],
    },
    reosan: {
        itemId: 'choiceBand',
        nature: ADAMANT,
        evs: createEvs({ hp: 252, atk: 252, spd: 4 }),
        moveNames: ['ポルターガイスト', 'メガホーン', 'であいがしら', 'ねがいごと'],
    },
};

export function getPokemonPreset(speciesId: string): PokemonPreset | undefined {
    return POKEMON_PRESETS[speciesId];
}

export function resolvePresetMoveIds(
    preset: PokemonPreset | undefined,
    moves: MoveData,
    fallbackMoveIds: string[],
): string[] {
    const fallbackValidMoveIds = fallbackMoveIds.filter((moveId) => moves[moveId]);

    if (!preset) {
        return fallbackValidMoveIds.slice(0, 4);
    }

    const moveIdByName = new Map<string, string>();

    for (const [moveId, move] of Object.entries(moves)) {
        moveIdByName.set(move.name, moveId);
    }

    const presetMoveIds = preset.moveNames
        .map((moveName) => {
            if (moves[moveName]) {
                return moveName;
            }

            return moveIdByName.get(moveName);
        })
        .filter((moveId): moveId is string => Boolean(moveId))
        .filter((moveId) => moves[moveId]);

    const uniqueMoveIds = Array.from(new Set(presetMoveIds));

    for (const moveId of fallbackValidMoveIds) {
        if (uniqueMoveIds.length >= 4) break;
        if (!uniqueMoveIds.includes(moveId)) {
            uniqueMoveIds.push(moveId);
        }
    }

    return uniqueMoveIds.slice(0, 4);
}