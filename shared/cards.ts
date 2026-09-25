/** Where a card sends you, resolved against whichever map and board size is in play. */
export type CardTarget = { kind: 'start' } | { kind: 'group'; group: string; pick: 'first' | 'last' } | { kind: 'airport'; n: number };

export type CardEffect =
  | { kind: 'money'; amount: number }
  | { kind: 'moveTo'; target: CardTarget }
  | { kind: 'moveBy'; steps: number }
  | { kind: 'jail' }
  | { kind: 'jailCard' }
  /** positive: every other player pays you; negative: you pay every other player */
  | { kind: 'eachPlayer'; amount: number }
  | { kind: 'repairs'; house: number; hotel: number }
  | { kind: 'nearest'; target: 'airport' | 'utility' }
  // party deck
  | { kind: 'percentFromEach'; pct: number }
  | { kind: 'payPercent'; pct: number }
  | { kind: 'everyone'; amount: number }
  | { kind: 'halfJackpot' }
  | { kind: 'freeHouse' }
  // chaos deck
  | { kind: 'swapPlaces' }
  | { kind: 'stealCity' }
  | { kind: 'allBack'; steps: number }
  | { kind: 'reverse' }
  | { kind: 'giftPoorest' };

export interface Card {
  /** {tile} is replaced with the target tile's name on the current map */
  text: string;
  effect: CardEffect;
}

export type DeckStyle = 'classic' | 'party' | 'chaos';

const CHANCE_CLASSIC: Card[] = [
  { text: 'Advance to Start. Collect your salary.', effect: { kind: 'moveTo', target: { kind: 'start' } } },
  { text: 'Fly to {tile}. Collect your salary if you pass Start.', effect: { kind: 'moveTo', target: { kind: 'group', group: 'red', pick: 'last' } } },
  { text: 'Take a trip to {tile}. Collect your salary if you pass Start.', effect: { kind: 'moveTo', target: { kind: 'group', group: 'pink', pick: 'first' } } },
  { text: 'Go to the nearest airport. If it is owned, pay double rent.', effect: { kind: 'nearest', target: 'airport' } },
  { text: 'Go to the nearest airport. If it is owned, pay double rent.', effect: { kind: 'nearest', target: 'airport' } },
  { text: 'Go to the nearest utility. If it is owned, pay 10x your dice roll.', effect: { kind: 'nearest', target: 'utility' } },
  { text: 'Your crypto finally went up. Collect $50.', effect: { kind: 'money', amount: 50 } },
  { text: 'Get out of Prison free. Keep this card until needed.', effect: { kind: 'jailCard' } },
  { text: 'Missed your stop. Go back 3 spaces.', effect: { kind: 'moveBy', steps: -3 } },
  { text: 'Caught speeding on the motorway. Go to Prison.', effect: { kind: 'jail' } },
  { text: 'Renovations due: pay $25 per house and $100 per hotel.', effect: { kind: 'repairs', house: 25, hotel: 100 } },
  { text: 'Parking ticket. Pay $15.', effect: { kind: 'money', amount: -15 } },
  { text: 'Catch a flight from {tile}. Collect your salary if you pass Start.', effect: { kind: 'moveTo', target: { kind: 'airport', n: 1 } } },
  { text: 'Treat yourself to {tile}.', effect: { kind: 'moveTo', target: { kind: 'group', group: 'blue', pick: 'last' } } },
  { text: 'You got elected group-chat admin. Pay each player $50.', effect: { kind: 'eachPlayer', amount: -50 } },
  { text: 'Your side hustle paid off. Collect $150.', effect: { kind: 'money', amount: 150 } },
];

const CHEST_CLASSIC: Card[] = [
  { text: 'Advance to Start. Collect your salary.', effect: { kind: 'moveTo', target: { kind: 'start' } } },
  { text: 'Bank error in your favour. Collect $200.', effect: { kind: 'money', amount: 200 } },
  { text: 'Dentist bill. Pay $50.', effect: { kind: 'money', amount: -50 } },
  { text: 'You sold your old phone. Collect $50.', effect: { kind: 'money', amount: 50 } },
  { text: 'Get out of Prison free. Keep this card until needed.', effect: { kind: 'jailCard' } },
  { text: 'Tax audit went badly. Go to Prison.', effect: { kind: 'jail' } },
  { text: 'Holiday savings matured. Collect $100.', effect: { kind: 'money', amount: 100 } },
  { text: 'Tax refund. Collect $20.', effect: { kind: 'money', amount: 20 } },
  { text: "It's your birthday! Collect $10 from every player.", effect: { kind: 'eachPlayer', amount: 10 } },
  { text: 'Life insurance pays out. Collect $100.', effect: { kind: 'money', amount: 100 } },
  { text: 'Hospital bill. Pay $100.', effect: { kind: 'money', amount: -100 } },
  { text: 'University fees. Pay $50.', effect: { kind: 'money', amount: -50 } },
  { text: 'Freelance gig paid. Collect $25.', effect: { kind: 'money', amount: 25 } },
  { text: 'Street repairs: pay $40 per house and $115 per hotel.', effect: { kind: 'repairs', house: 40, hotel: 115 } },
  { text: 'You won second place in a talent show. Collect $10.', effect: { kind: 'money', amount: 10 } },
  { text: 'You inherit $100.', effect: { kind: 'money', amount: 100 } },
];

const PARTY: Card[] = [
  { text: 'Your startup got acquired! Everyone pays you 10% of their cash.', effect: { kind: 'percentFromEach', pct: 10 } },
  { text: 'You lost a bet on the cricket. Pay 10% of your cash into the jackpot.', effect: { kind: 'payPercent', pct: 10 } },
  { text: 'Viral video money! Collect $300.', effect: { kind: 'money', amount: 300 } },
  { text: 'Your car got towed and impounded. Pay $250.', effect: { kind: 'money', amount: -250 } },
  { text: 'Government handout: every player collects $100.', effect: { kind: 'everyone', amount: 100 } },
  { text: 'Lucky ticket: collect half of the Vacation jackpot.', effect: { kind: 'halfJackpot' } },
  { text: 'Contractor owes you a favour: build one free house on a full set.', effect: { kind: 'freeHouse' } },
  { text: 'Wedding season. Pay each player $30 salami.', effect: { kind: 'eachPlayer', amount: -30 } },
];

const CHAOS: Card[] = [
  { text: 'Wormhole! Swap places with a random player.', effect: { kind: 'swapPlaces' } },
  { text: 'Hostile takeover: steal a random city (no buildings) from a rival.', effect: { kind: 'stealCity' } },
  { text: 'Earthquake shifts the board. Every player moves back 3 spaces.', effect: { kind: 'allBack', steps: 3 } },
  { text: 'Wrong way! Your next roll moves you backwards.', effect: { kind: 'reverse' } },
  { text: 'Robin Hood strikes: give your cheapest city to the poorest player.', effect: { kind: 'giftPoorest' } },
  { text: 'Wormhole! Swap places with a random player.', effect: { kind: 'swapPlaces' } },
];

export function deckFor(deck: 'chance' | 'chest', style: DeckStyle): Card[] {
  const base = deck === 'chance' ? CHANCE_CLASSIC : CHEST_CLASSIC;
  if (style === 'classic') return base;
  // party and chaos cards are split between both decks so either card tile can surprise you
  const half = <T,>(list: T[]) => list.filter((_, i) => (i % 2 === 0) === (deck === 'chance'));
  const party = half(PARTY);
  if (style === 'party') return [...base, ...party];
  return [...base, ...party, ...half(CHAOS)];
}
