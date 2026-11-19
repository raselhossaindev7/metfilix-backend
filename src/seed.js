import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { connect, close, setSequence } from './db.js';

async function seed() {
  console.log('Seeding MongoDB...');
  const db = await connect();

  const collections = [
    'users', 'profiles', 'movies', 'hero_slides', 'rows_config',
    'my_list', 'watch_progress', 'episodes', 'counters',
  ];
  for (const name of collections) {
    await db.collection(name).deleteMany({});
  }

  const adminHash = await bcrypt.hash('admin123', 10);
  const demoHash = await bcrypt.hash('demo123', 10);
  const now = new Date();

  const adminId = randomUUID();
  const demoId = randomUUID();

  await db.collection('users').insertMany([
    { _id: adminId, email: 'admin@metfilix.com', password_hash: adminHash, name: 'Admin', role: 'admin', status: 'active', token_version: 0, created_at: now },
    { _id: demoId, email: 'demo@metfilix.com', password_hash: demoHash, name: 'Demo', role: 'user', status: 'active', token_version: 0, created_at: now },
  ]);

  const profileTpl = [
    { name: 'You', avatar: 'https://i.pravatar.cc/150?img=12', color: '#1E90FF' },
    { name: 'Kids', avatar: 'https://i.pravatar.cc/150?img=8', color: '#FFD700' },
    { name: 'Mom', avatar: 'https://i.pravatar.cc/150?img=5', color: '#32CD32' },
  ];
  const profiles = [];
  for (const uid of [adminId, demoId]) {
    for (const p of profileTpl) {
      profiles.push({
        _id: randomUUID(), user_id: uid, ...p,
        kids_pin: null, language: 'English', kids_mode: false, created_at: now,
      });
    }
  }
  await db.collection('profiles').insertMany(profiles);

  const hero = [
    ['STRANGER THINGS', 'Season 4', 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.', '97% Match', 'TV-14', '4 Seasons', 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop', 0],
    ['THE WITCHER', 'Season 3', 'Geralt of Rivia, a mutated monster-hunter for hire, journeys toward his destiny.', '95% Match', 'TV-MA', '3 Seasons', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1920&h=1080&fit=crop', 1],
    ['MONEY HEIST', 'Season 5', 'An unusual group of robbers attempt the most perfect robbery.', '96% Match', 'TV-MA', '5 Seasons', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&h=1080&fit=crop', 2],
  ];
  await db.collection('hero_slides').insertMany(hero.map((h, i) => ({
    id: i + 1, title: h[0], season: h[1], description: h[2], match: h[3],
    rating: h[4], seasons: h[5], bg: h[6], position: h[7], movie_id: null,
  })));

  const rows = [
    ['Continue Watching for You', 'Continue Watching for You', 0],
    ['Top 10 in Your Country Today', 'Top 10 in Your Country Today', 1],
    ['Trending Now', 'Trending Now', 2],
    ['Metfilix Originals', 'Metfilix Originals', 3],
    ['Watch Again', 'Watch Again', 4],
    ['Because You Watched Dark', 'Because You Watched Dark', 5],
  ];
  await db.collection('rows_config').insertMany(rows.map((r, i) => ({
    id: i + 1, title: r[0], category: r[1], position: r[2],
  })));

  const HLS_1080 = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const HLS_SINTEL = 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8';
  const HLS_4K = 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8';

  const movies = [
    ['The Witcher', '2023', '98% Match', 'TV-MA', '2h 14m', 'Continue Watching for You', 'All', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&h=225&fit=crop', HLS_1080, ['Fantasy', 'Epic', 'Dark'], null, 65],
    ['Money Heist', '2021', '95% Match', 'TV-MA', '2h 10m', 'Continue Watching for You', 'All', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=225&fit=crop', HLS_1080, ['Thriller', 'Crime'], null, 32],
    ['Dark', '2020', '97% Match', 'TV-MA', '1h 50m', 'Continue Watching for You', 'All', 'https://images.unsplash.com/photo-1533928298208-27ff66555d8d?w=400&h=225&fit=crop', HLS_SINTEL, ['Mystery', 'Sci-Fi'], null, 80],
    ['The Crown', '2022', '92% Match', 'TV-14', '1h 58m', 'Continue Watching for You', 'All', 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&h=225&fit=crop', HLS_1080, ['Drama', 'History'], null, 12],
    ['Bridgerton', '2023', '89% Match', 'TV-MA', '1h 45m', 'Continue Watching for You', 'All', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=225&fit=crop', HLS_1080, ['Romance', 'Period'], null, 45],
    ['Squid Game', '2024', '99% Match', 'TV-MA', '1h 32m', 'Top 10 in Your Country Today', 'All', 'https://images.unsplash.com/photo-1515630771457-09367d795264?w=400&h=225&fit=crop', HLS_4K, ['Thriller', 'Action'], 1, null],
    ['Wednesday', '2023', '96% Match', 'TV-14', '45m', 'Top 10 in Your Country Today', 'All', 'https://images.unsplash.com/photo-1509343256512-d77a5cb3791b?w=400&h=225&fit=crop', HLS_1080, ['Comedy', 'Mystery'], 2, null],
    ['Lupin', '2023', '94% Match', 'TV-MA', '52m', 'Top 10 in Your Country Today', 'All', 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&h=225&fit=crop', HLS_1080, ['Crime', 'Drama'], 3, null],
    ['The Night Agent', '2023', '91% Match', 'TV-MA', '55m', 'Top 10 in Your Country Today', 'All', 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=225&fit=crop', HLS_1080, ['Action', 'Thriller'], 4, null],
    ['One Piece', '2023', '93% Match', 'TV-14', '24m', 'Top 10 in Your Country Today', 'All', 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=400&h=225&fit=crop', HLS_1080, ['Anime', 'Adventure'], 5, null],
    ['Red Notice', '2021', '88% Match', 'PG-13', '1h 58m', 'Trending Now', 'All', 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=400&h=225&fit=crop', HLS_4K, ['Action', 'Comedy'], null, null],
    ["Don't Look Up", '2021', '85% Match', 'R', '2h 18m', 'Trending Now', 'All', 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=400&h=225&fit=crop', HLS_1080, ['Comedy', 'Drama'], null, null],
    ['The Adam Project', '2022', '90% Match', 'PG-13', '1h 46m', 'Trending Now', 'All', 'https://images.unsplash.com/photo-1514533212735-5df27d970db0?w=400&h=225&fit=crop', HLS_1080, ['Sci-Fi', 'Adventure'], null, null],
    ['Bird Box', '2018', '87% Match', 'R', '2h 04m', 'Trending Now', 'All', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&h=225&fit=crop', HLS_1080, ['Thriller', 'Horror'], null, null],
    ['Extraction', '2020', '86% Match', 'R', '1h 57m', 'Trending Now', 'All', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=225&fit=crop', HLS_1080, ['Action'], null, null],
    ['House of Cards', '2018', '95% Match', 'TV-MA', '55m', 'Metfilix Originals', 'All', 'https://images.unsplash.com/photo-1594909771206-002d18ea0c4e?w=400&h=225&fit=crop', HLS_1080, ['Drama', 'Political'], null, null],
    ['Orange Is New Black', '2019', '92% Match', 'TV-MA', '59m', 'Metfilix Originals', 'All', 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=400&h=225&fit=crop', HLS_1080, ['Comedy', 'Drama'], null, null],
    ['Mindhunter', '2019', '94% Match', 'TV-MA', '60m', 'Metfilix Originals', 'All', 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&h=225&fit=crop', HLS_1080, ['Crime', 'Thriller'], null, null],
    ['Narcos', '2017', '96% Match', 'TV-MA', '49m', 'Metfilix Originals', 'All', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=225&fit=crop', HLS_SINTEL, ['Crime', 'History'], null, null],
    ["The Queen's Gambit", '2020', '97% Match', 'TV-MA', '60m', 'Metfilix Originals', 'All', 'https://images.unsplash.com/photo-1586165368502-1bad197a6461?w=400&h=225&fit=crop', HLS_1080, ['Drama'], null, null],
  ];

  await db.collection('movies').insertMany(movies.map((m, i) => {
    const videoUrl = m[8];
    const isHls = typeof videoUrl === 'string' && videoUrl.includes('.m3u8');
    return {
      id: i + 1,
      title: m[0],
      description: '',
      year: m[1],
      match: m[2],
      rating: m[3],
      duration: m[4],
      category: m[5],
      lang: m[6],
      img: m[7],
      video_url: videoUrl,
      subtitle_url: '',
      genres: m[9],
      rank: m[10],
      progress: m[11],
      video_sources: isHls ? [{ label: 'Auto HLS (adaptive)', url: videoUrl, hls: true }] : [],
      codec: 'h264',
      is_hls: isHls,
      views: 0,
      likes: 0,
      dislikes: 0,
      slug: null,
      director: '',
      cast: [],
      created_at: now,
    };
  }));

  await setSequence('movies', movies.length);
  await setSequence('rows', rows.length);
  await setSequence('hero_slides', hero.length);
  await setSequence('episodes', 0);

  console.log(`Seeded ${movies.length} movies, ${rows.length} rows, admin/demo users`);
  await close();
}

seed().catch((e) => { console.error(e); process.exit(1); });
