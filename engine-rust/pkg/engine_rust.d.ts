/* tslint:disable */
/* eslint-disable */

export function createBattleState(players: any): any;

export function createCreature(species_id: string, options: any): any;

export function getBestMoveMCTS(state: any, player_id: string, iterations: number): any;

export function getBestMoveMinimax(state: any, player_id: string, depth: number): any;

export function isBattleOver(state: any): boolean;

export function stepBattle(state: any, actions: any, options: any): any;
