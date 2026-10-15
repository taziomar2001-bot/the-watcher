import type { Game } from '../types'
import { makePoster, makeBackdrop } from './poster'

// Sample catalogue used only when the IGDB proxy isn't switched on (local
// development and tests). Real games with their published facts; the "sample"
// entry exists so an upcoming release can be shown and tested.

function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const g = (
  id: string,
  title: string,
  releaseDate: string,
  developer: string,
  genres: string[],
  platforms: string[],
  rating: number,
  normally: number | undefined,
  overview: string,
  modes: string[] = ['Single player'],
): Game => ({
  id,
  type: 'game',
  title,
  releaseDate,
  year: Number(releaseDate.slice(0, 4)),
  developer,
  genres,
  platforms,
  modes,
  communityRating: rating || undefined,
  communityVotes: rating ? 900 : undefined,
  timeToBeat: normally ? { hastily: Math.round(normally * 0.7), normally, completely: Math.round(normally * 1.8) } : undefined,
  overview,
  poster: makePoster(title),
  backdrop: makeBackdrop(title),
})

export const GAMES_MOCK: Game[] = [
  g('gm-totk', 'The Legend of Zelda: Tears of the Kingdom', '2023-05-12', 'Nintendo', ['Adventure', 'RPG'], ['Switch'], 9.4, 60, 'Link explores the skies and depths of Hyrule to stop an ancient evil.'),
  g('gm-eldenring', 'Elden Ring', '2022-02-25', 'FromSoftware', ['RPG', 'Adventure'], ['PC', 'PS5', 'Xbox Series X|S'], 9.4, 58, 'Rise, Tarnished, and become an Elden Lord in the Lands Between.', ['Single player', 'Multiplayer']),
  g('gm-bg3', 'Baldur’s Gate 3', '2023-08-03', 'Larian Studios', ['RPG', 'Strategy'], ['PC', 'PS5', 'Xbox Series X|S'], 9.5, 75, 'Gather your party in a story-rich RPG set in the world of Dungeons & Dragons.', ['Single player', 'Co-op']),
  g('gm-hades', 'Hades', '2020-09-17', 'Supergiant Games', ['Action', 'Indie', 'RPG'], ['PC', 'Switch', 'PS5'], 9.3, 22, 'Defy the god of the dead as you hack and slash out of the Underworld.'),
  g('gm-stardew', 'Stardew Valley', '2016-02-26', 'ConcernedApe', ['Simulation', 'RPG', 'Indie'], ['PC', 'Switch', 'PS4', 'Mobile'], 9.0, 52, 'Inherit your grandfather’s old farm plot and build a new life in Stardew Valley.', ['Single player', 'Co-op']),
  g('gm-hollow', 'Hollow Knight', '2017-02-24', 'Team Cherry', ['Platform', 'Adventure', 'Indie'], ['PC', 'Switch', 'PS4'], 9.0, 27, 'Descend into the ruined bug kingdom of Hallownest.'),
  g('gm-silksong', 'Hollow Knight: Silksong', '2025-09-04', 'Team Cherry', ['Platform', 'Adventure', 'Indie'], ['PC', 'Switch', 'PS5'], 9.0, 30, 'Play as Hornet, princess-protector of Hallownest, in a haunted new kingdom.'),
  g('gm-witcher3', 'The Witcher 3: Wild Hunt', '2015-05-19', 'CD Projekt Red', ['RPG', 'Adventure'], ['PC', 'PS5', 'Xbox Series X|S', 'Switch'], 9.3, 52, 'Geralt of Rivia hunts for his adopted daughter across a war-torn world.'),
  g('gm-rdr2', 'Red Dead Redemption 2', '2018-10-26', 'Rockstar Games', ['Adventure', 'Shooter'], ['PC', 'PS4', 'Xbox One'], 9.3, 50, 'Arthur Morgan and the Van der Linde gang ride across a dying American frontier.', ['Single player', 'Multiplayer']),
  g('gm-gowr', 'God of War Ragnarök', '2022-11-09', 'Santa Monica Studio', ['Adventure', 'Hack & Slash'], ['PS5', 'PS4', 'PC'], 9.2, 26, 'Kratos and Atreus journey through the Nine Realms as Ragnarök approaches.'),
  g('gm-cyberpunk', 'Cyberpunk 2077', '2020-12-10', 'CD Projekt Red', ['RPG', 'Shooter'], ['PC', 'PS5', 'Xbox Series X|S'], 8.6, 25, 'A mercenary outlaw chases a one-of-a-kind implant in Night City.'),
  g('gm-minecraft', 'Minecraft', '2011-11-18', 'Mojang Studios', ['Simulation', 'Adventure'], ['PC', 'Switch', 'PS4', 'Xbox One', 'Mobile'], 8.8, undefined, 'Explore, build and survive in an endless world of blocks.', ['Single player', 'Multiplayer']),
  g('gm-fortnite', 'Fortnite', '2017-07-25', 'Epic Games', ['Shooter'], ['PC', 'PS5', 'Xbox Series X|S', 'Switch', 'Mobile'], 7.6, undefined, 'Drop in, build and battle to be the last one standing.', ['Multiplayer', 'Battle royale']),
  g('gm-celeste', 'Celeste', '2018-01-25', 'Maddy Makes Games', ['Platform', 'Indie'], ['PC', 'Switch', 'PS4', 'Xbox One'], 9.1, 8, 'Help Madeline survive her inner demons on her journey to the top of Celeste Mountain.'),
  g('gm-ittakestwo', 'It Takes Two', '2021-03-26', 'Hazelight Studios', ['Platform', 'Adventure'], ['PC', 'PS5', 'Xbox Series X|S', 'Switch'], 9.0, 13, 'A couple turned into dolls must work together to find their way back.', ['Co-op']),
  g('gm-astrobot', 'Astro Bot', '2024-09-06', 'Team Asobi', ['Platform'], ['PS5'], 9.4, 11, 'Astro sets off across galaxies to rescue his crew.'),
  g('gm-hades2', 'Hades II', '2025-09-25', 'Supergiant Games', ['Action', 'Indie', 'RPG'], ['PC', 'Switch'], 9.2, 25, 'Battle beyond the Underworld as Melinoë, Princess of the Underworld.'),
  g('gm-gta6', 'Grand Theft Auto VI', '2026-11-19', 'Rockstar Games', ['Adventure', 'Shooter'], ['PS5', 'Xbox Series X|S'], 0, undefined, 'Lucia and Jason are pulled into the criminal underbelly of Leonida.', ['Single player', 'Multiplayer']),
  g('gm-sample-1', 'Upcoming Game (sample)', daysFromNow(14), 'Sample Studio', ['Adventure'], ['PC', 'PS5'], 0, undefined, 'A sample upcoming release used when no games catalogue is connected.'),
]

export const GAMES_MOCK_BY_ID: Record<string, Game> = Object.fromEntries(GAMES_MOCK.map((x) => [x.id, x]))
