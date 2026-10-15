import type { Book } from '../types'
import { makePoster } from './poster'

// Sample catalogue used only in sample mode (no TMDB key: local development
// and tests). Real titles with their published facts; the two
// "sample" entries exist so upcoming releases can be shown and tested.

function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const b = (
  id: string,
  title: string,
  authors: string[],
  year: number,
  pageCount: number,
  genres: string[],
  rating: number,
  overview: string,
  releaseDate?: string,
): Book => ({
  id,
  type: 'book',
  title,
  authors,
  year: releaseDate ? Number(releaseDate.slice(0, 4)) : year,
  pageCount,
  genres,
  communityRating: rating,
  communityVotes: 1200,
  overview,
  releaseDate,
  poster: makePoster(title),
})

export const BOOKS_MOCK: Book[] = [
  b('bk-hailmary', 'Project Hail Mary', ['Andy Weir'], 2021, 476, ['Science Fiction'], 9.0, 'A lone astronaut wakes on a ship with no memory and a mission to save Earth.'),
  b('bk-fourthwing', 'Fourth Wing', ['Rebecca Yarros'], 2023, 528, ['Fantasy', 'Romance'], 8.4, 'Violet Sorrengail is forced into the riders quadrant of a brutal war college for dragon riders.'),
  b('bk-ironflame', 'Iron Flame', ['Rebecca Yarros'], 2023, 623, ['Fantasy', 'Romance'], 8.2, 'The second year at Basgiath War College brings new dangers and old secrets.'),
  b('bk-midnight', 'The Midnight Library', ['Matt Haig'], 2020, 304, ['Literary Fiction'], 8.0, 'Between life and death there is a library, and every book is a life you could have lived.'),
  b('bk-dune', 'Dune', ['Frank Herbert'], 1965, 688, ['Science Fiction'], 9.0, 'On the desert planet Arrakis, young Paul Atreides is drawn into a war over the universe’s most precious resource.'),
  b('bk-tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow', ['Gabrielle Zevin'], 2022, 416, ['Literary Fiction'], 8.4, 'Two friends build video games together across three decades of love, rivalry and collaboration.'),
  b('bk-hobbit', 'The Hobbit', ['J.R.R. Tolkien'], 1937, 310, ['Fantasy'], 9.0, 'Bilbo Baggins is swept into a quest to reclaim a dwarf kingdom from a dragon.'),
  b('bk-atomic', 'Atomic Habits', ['James Clear'], 2018, 320, ['Self-Help'], 8.8, 'Tiny changes, remarkable results: a practical guide to building good habits and breaking bad ones.'),
  b('bk-sapiens', 'Sapiens', ['Yuval Noah Harari'], 2014, 443, ['History'], 8.8, 'A brief history of humankind, from the Stone Age to the present.'),
  b('bk-silent', 'The Silent Patient', ['Alex Michaelides'], 2019, 336, ['Thriller', 'Mystery'], 8.2, 'A famous painter shoots her husband and never speaks again. A therapist sets out to learn why.'),
  b('bk-educated', 'Educated', ['Tara Westover'], 2018, 334, ['Biography & Autobiography'], 9.0, 'A memoir of growing up in a survivalist family and finding a way out through education.'),
  b('bk-wind', 'The Name of the Wind', ['Patrick Rothfuss'], 2007, 662, ['Fantasy'], 9.0, 'Kvothe tells the story of how he became the most notorious wizard of his age.'),
  b('bk-klara', 'Klara and the Sun', ['Kazuo Ishiguro'], 2021, 303, ['Literary Fiction', 'Science Fiction'], 7.6, 'An Artificial Friend watches the world and the family she is bought to serve.'),
  b('bk-gonegirl', 'Gone Girl', ['Gillian Flynn'], 2012, 432, ['Thriller', 'Mystery'], 8.2, 'On their fifth anniversary, Amy disappears, and Nick becomes the prime suspect.'),
  b('bk-hugo', 'The Seven Husbands of Evelyn Hugo', ['Taylor Jenkins Reid'], 2017, 400, ['Historical Fiction'], 8.8, 'A reclusive Hollywood icon finally tells the truth about her glamorous and scandalous life.'),
  b('bk-1984', 'Nineteen Eighty-Four', ['George Orwell'], 1949, 328, ['Science Fiction', 'Literary Fiction'], 8.8, 'Winston Smith works for the Party in a world of total surveillance, and dares to think for himself.'),
  b('bk-kings', 'The Way of Kings', ['Brandon Sanderson'], 2010, 1007, ['Fantasy'], 9.2, 'On a storm-swept world, a soldier, a scholar and a fallen prince are drawn into an ancient war.'),
  b('bk-sample-1', 'Upcoming Novel (sample)', ['Sample Author'], 2027, 380, ['Literary Fiction'], 0, 'A sample upcoming release used when no books catalogue is connected.', daysFromNow(9)),
  b('bk-sample-2', 'Upcoming Fantasy (sample)', ['Sample Author'], 2027, 520, ['Fantasy'], 0, 'A sample upcoming release used when no books catalogue is connected.', daysFromNow(26)),
]

export const BOOKS_MOCK_BY_ID: Record<string, Book> = Object.fromEntries(BOOKS_MOCK.map((x) => [x.id, x]))
