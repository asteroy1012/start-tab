// One quote per day, chosen by the date, so it changes at midnight and works offline.
// Edit this list to change the bundled quotes, or add your own in Settings → Your quotes.
const QUOTES = [
  ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius'],
  ['Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius'],
  ['What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['Very little is needed to make a happy life.', 'Marcus Aurelius'],
  ['Dwell on the beauty of life. Watch the stars, and see yourself running with them.', 'Marcus Aurelius'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['Luck is what happens when preparation meets opportunity.', 'Seneca'],
  ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
  ['Difficulties strengthen the mind, as labour does the body.', 'Seneca'],
  ['No man is free who is not master of himself.', 'Epictetus'],
  ['First say to yourself what you would be; and then do what you have to do.', 'Epictetus'],
  ['Not all those who wander are lost.', 'J. R. R. Tolkien'],
  ['All we have to decide is what to do with the time that is given us.', 'J. R. R. Tolkien'],
  ['It’s the job that’s never started that takes longest to finish.', 'J. R. R. Tolkien'],
  ['Courage is found in unlikely places.', 'J. R. R. Tolkien'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
  ['Lost time is never found again.', 'Benjamin Franklin'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Design is not just what it looks like and feels like. Design is how it works.', 'Steve Jobs'],
  ['Real artists ship.', 'Steve Jobs'],
  ['Stay hungry. Stay foolish.', 'The Whole Earth Catalog'],
  ['Do. Or do not. There is no try.', 'Yoda, The Empire Strikes Back'],
  ['With great power comes great responsibility.', 'Spider-Man'],
  ['Anyone can wear the mask. You could wear the mask.', 'Into the Spider-Verse'],
  ['It does not do to dwell on dreams and forget to live.', 'J. K. Rowling'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb'],
  ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['Nature does not hurry, yet everything is accomplished.', 'Lao Tzu'],
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant'],
  ['The unexamined life is not worth living.', 'Socrates'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['Imagination is more important than knowledge.', 'Albert Einstein'],
  ['Life is like riding a bicycle. To keep your balance you must keep moving.', 'Albert Einstein'],
  ['We are a way for the cosmos to know itself.', 'Carl Sagan'],
  ['The cosmos is within us. We are made of star-stuff.', 'Carl Sagan'],
  ['Look up at the stars and not down at your feet.', 'Stephen Hawking'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
  ['The best way to predict the future is to invent it.', 'Alan Kay'],
  ['Simple things should be simple, complex things should be possible.', 'Alan Kay'],
  ['Programs must be written for people to read, and only incidentally for machines to execute.', 'Harold Abelson'],
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['Premature optimization is the root of all evil.', 'Donald Knuth'],
  ['If you want to go fast, go alone. If you want to go far, go together.', 'African proverb'],
  ['What we do in life echoes in eternity.', 'Gladiator'],
  ['Why do we fall? So we can learn to pick ourselves up.', 'Batman Begins'],
  ['It’s not who I am underneath, but what I do that defines me.', 'Batman Begins'],
  ['Life moves pretty fast. If you don’t stop and look around once in a while, you could miss it.', 'Ferris Bueller’s Day Off'],
  ['Just keep swimming.', 'Finding Nemo'],
  ['Get busy living, or get busy dying.', 'The Shawshank Redemption'],
  ['Hope is a good thing, maybe the best of things.', 'The Shawshank Redemption'],
  ['Racing is life. Anything before or after is just waiting.', 'Le Mans'],
  ['Do not go gentle into that good night.', 'Dylan Thomas'],
  ['Genius is one percent inspiration and ninety-nine percent perspiration.', 'Thomas Edison'],
  ['To live is the rarest thing in the world. Most people exist, that is all.', 'Oscar Wilde'],
  ['We are all in the gutter, but some of us are looking at the stars.', 'Oscar Wilde'],
  ['The only thing we have to fear is fear itself.', 'Franklin D. Roosevelt'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['Fortune favours the bold.', 'Latin proverb'],
  ['Everything you can imagine is real.', 'Pablo Picasso'],
  ['Inspiration exists, but it has to find you working.', 'Pablo Picasso'],
  ['Creativity takes courage.', 'Henri Matisse'],
  ['Have no fear of perfection. You’ll never reach it.', 'Salvador Dalí'],
  ['The details are not the details. They make the design.', 'Charles Eames'],
  ['Less, but better.', 'Dieter Rams'],
  ['Good design is as little design as possible.', 'Dieter Rams'],
  ['I am not afraid of storms, for I am learning how to sail my ship.', 'Louisa May Alcott'],
  ['I am large, I contain multitudes.', 'Walt Whitman'],
  ['Tell me, what is it you plan to do with your one wild and precious life?', 'Mary Oliver'],
  ['The wound is the place where the light enters you.', 'Rumi'],
  ['What you seek is seeking you.', 'Rumi'],
  ['Man cannot discover new oceans unless he has the courage to lose sight of the shore.', 'André Gide'],
  ['The man who moves a mountain begins by carrying away small stones.', 'Confucius'],
  ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
  ['Two roads diverged in a wood, and I took the one less traveled by.', 'Robert Frost'],
  ['In three words I can sum up everything I’ve learned about life: it goes on.', 'Robert Frost'],
  ['Not everything that is faced can be changed, but nothing can be changed until it is faced.', 'James Baldwin'],
  ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
  ['Float like a butterfly, sting like a bee.', 'Muhammad Ali'],
  ['So many books, so little time.', 'Frank Zappa'],
  ['The future belongs to those who believe in the beauty of their dreams.', 'Eleanor Roosevelt'],
  ['Nothing in life is to be feared, it is only to be understood.', 'Marie Curie'],
  ['Be less curious about people and more curious about ideas.', 'Marie Curie'],
  ['The only journey is the one within.', 'Rainer Maria Rilke'],
  ['Change is the law of life.', 'John F. Kennedy'],
  ['Fall seven times, stand up eight.', 'Japanese proverb'],
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// The pool is the bundled list plus the user's own quotes (Settings → Your quotes).
function quotePool(extra = []) {
  return [...QUOTES, ...extra.filter(q => Array.isArray(q) && q[0])];
}

function quoteForDay(date = new Date(), extra = []) {
  const pool = quotePool(extra);
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  // A fixed stride walks the list in a scrambled but repeatable order, so neighbours do not share an author.
  // The stride must share no factor with the pool size, or some quotes would never come round.
  let stride = 37;
  while (gcd(stride, pool.length) !== 1) stride++;
  const index = (day * stride) % pool.length;
  const [text, author = ''] = pool[index];
  return { text, author, index };
}

// A different quote from the pool, for the shuffle button.
function randomQuote(extra = [], notIndex = -1) {
  const pool = quotePool(extra);
  let index = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && index === notIndex) index = (index + 1) % pool.length;
  const [text, author = ''] = pool[index];
  return { text, author, index };
}

// "Quote text — Author" per line. The author follows the last dash with spaces round it (—, – or -).
function parseQuotes(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.*\S)\s+[—–-]\s+([^—–]+)$/);
    const quote = (m ? m[1] : line).replace(/^["“]|["”]$/g, '').trim();
    return [quote, m ? m[2].trim() : ''];
  }).filter(q => q[0]);
}

const formatQuotes = list => list.map(([q, a]) => (a ? `${q} — ${a}` : q)).join('\n');
