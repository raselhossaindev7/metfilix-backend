import { query, getPool } from './db.js';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding...');
  await query("DELETE FROM watch_progress");
  await query("DELETE FROM my_list");
  await query("DELETE FROM movies");
  await query("DELETE FROM hero_slides");
  await query("DELETE FROM rows_config");
  await query("DELETE FROM profiles");
  // keep users? clear non-admin
  // create admin + demo
  const adminHash = await bcrypt.hash('admin123', 10);
  const demoHash = await bcrypt.hash('demo123', 10);
  const admin = await query("INSERT INTO users(email,password_hash,name,role) VALUES('admin@metfilix.com',$1,'Admin','admin') ON CONFLICT (email) DO UPDATE SET password_hash=$1 RETURNING id", [adminHash]);
  const demo = await query("INSERT INTO users(email,password_hash,name,role) VALUES('demo@metfilix.com',$1,'Demo','user') ON CONFLICT (email) DO UPDATE SET password_hash=$1 RETURNING id", [demoHash]);
  const adminId = admin.rows[0].id;
  const demoId = demo.rows[0].id;
  for (const [uid, name] of [[adminId,'Admin'],[demoId,'Demo']]) {
    await query("DELETE FROM profiles WHERE user_id=$1", [uid]);
    await query("INSERT INTO profiles(user_id,name,avatar,color) VALUES($1,'You','https://i.pravatar.cc/150?img=12','#1E90FF'),($1,'Kids','https://i.pravatar.cc/150?img=8','#FFD700'),($1,'Mom','https://i.pravatar.cc/150?img=5','#32CD32')", [uid]);
  }

  const hero = [
    ['STRANGER THINGS','Season 4','When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.','97% Match','TV-14','4 Seasons','https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop',0],
    ['THE WITCHER','Season 3','Geralt of Rivia, a mutated monster-hunter for hire, journeys toward his destiny.','95% Match','TV-MA','3 Seasons','https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1920&h=1080&fit=crop',1],
    ['MONEY HEIST','Season 5','An unusual group of robbers attempt the most perfect robbery.','96% Match','TV-MA','5 Seasons','https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&h=1080&fit=crop',2],
  ];
  for (const h of hero) await query("INSERT INTO hero_slides(title,season,description,match,rating,seasons,bg,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", h);

  const rows = [
    ['Continue Watching for You','Continue Watching for You',0],
    ['Top 10 in Your Country Today','Top 10 in Your Country Today',1],
    ['Trending Now','Trending Now',2],
    ['Metfilix Originals','Metfilix Originals',3],
    ['Watch Again','Watch Again',4],
    ['Because You Watched Dark','Because You Watched Dark',5],
  ];
  for (const r of rows) await query("INSERT INTO rows_config(title,category,position) VALUES($1,$2,$3)", r);

  // Adaptive-first catalog: HLS master playlists, NOT single 2GB MKV.
  // Ladder convention (see tools/transcode-hls.sh):
  //   540p/720p = H.264 (every TV decodes in HW), 1080p/4K = HEVC.
  // R2 pattern: https://<bucket>.r2.dev/<movie>/master.m3u8
  const HLS_1080 = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const HLS_SINTEL = 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8';
  const HLS_4K = 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8';

  const movies = [
    // Continue
    ['The Witcher','2023','98% Match','TV-MA','2h 14m','Continue Watching for You','All','https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Fantasy","Epic","Dark"]',null,65],
    ['Money Heist','2021','95% Match','TV-MA','2h 10m','Continue Watching for You','All','https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Thriller","Crime"]',null,32],
    ['Dark','2020','97% Match','TV-MA','1h 50m','Continue Watching for You','All','https://images.unsplash.com/photo-1533928298208-27ff66555d8d?w=400&h=225&fit=crop',HLS_SINTEL,'["Mystery","Sci-Fi"]',null,80],
    ['The Crown','2022','92% Match','TV-14','1h 58m','Continue Watching for You','All','https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Drama","History"]',null,12],
    ['Bridgerton','2023','89% Match','TV-MA','1h 45m','Continue Watching for You','All','https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Romance","Period"]',null,45],
    // Top 10
    ['Squid Game','2024','99% Match','TV-MA','1h 32m','Top 10 in Your Country Today','All','https://images.unsplash.com/photo-1515630771457-09367d795264?w=400&h=225&fit=crop',HLS_4K,'["Thriller","Action"]',1,null],
    ['Wednesday','2023','96% Match','TV-14','45m','Top 10 in Your Country Today','All','https://images.unsplash.com/photo-1509343256512-d77a5cb3791b?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Comedy","Mystery"]',2,null],
    ['Lupin','2023','94% Match','TV-MA','52m','Top 10 in Your Country Today','All','https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Crime","Drama"]',3,null],
    ['The Night Agent','2023','91% Match','TV-MA','55m','Top 10 in Your Country Today','All','https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Action","Thriller"]',4,null],
    ['One Piece','2023','93% Match','TV-14','24m','Top 10 in Your Country Today','All','https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Anime","Adventure"]',5,null],
    // Trending
    ['Red Notice','2021','88% Match','PG-13','1h 58m','Trending Now','All','https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=400&h=225&fit=crop',HLS_4K,'["Action","Comedy"]',null,null],
    ['Don\'t Look Up','2021','85% Match','R','2h 18m','Trending Now','All','https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Comedy","Drama"]',null,null],
    ['The Adam Project','2022','90% Match','PG-13','1h 46m','Trending Now','All','https://images.unsplash.com/photo-1514533212735-5df27d970db0?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Sci-Fi","Adventure"]',null,null],
    ['Bird Box','2018','87% Match','R','2h 04m','Trending Now','All','https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Thriller","Horror"]',null,null],
    ['Extraction','2020','86% Match','R','1h 57m','Trending Now','All','https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Action"]',null,null],
    // Originals
    ['House of Cards','2018','95% Match','TV-MA','55m','Metfilix Originals','All','https://images.unsplash.com/photo-1594909771206-002d18ea0c4e?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Drama","Political"]',null,null],
    ['Orange Is New Black','2019','92% Match','TV-MA','59m','Metfilix Originals','All','https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Comedy","Drama"]',null,null],
    ['Mindhunter','2019','94% Match','TV-MA','60m','Metfilix Originals','All','https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Crime","Thriller"]',null,null],
    ['Narcos','2017','96% Match','TV-MA','49m','Metfilix Originals','All','https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=225&fit=crop',HLS_SINTEL,'["Crime","History"]',null,null],
    ['The Queen\'s Gambit','2020','97% Match','TV-MA','60m','Metfilix Originals','All','https://images.unsplash.com/photo-1586165368502-1bad197a6461?w=400&h=225&fit=crop','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','["Drama"]',null,null],
  ];
  for (const m of movies) {
    const videoUrl = m[8];
    const isHls = typeof videoUrl === 'string' && videoUrl.includes('.m3u8');
    const ladder = isHls
      ? JSON.stringify([{ label: 'Auto HLS (adaptive)', url: videoUrl, hls: true }])
      : JSON.stringify([]);
    await query("INSERT INTO movies(title,year,match,rating,duration,category,lang,img,video_url,genres,rank,progress,video_sources,codec,is_hls) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)", [m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11],ladder,'h264',isHls]);
  }
  console.log('Seeded', movies.length, 'movies, admin/demo users');
  await getPool().end();
}
seed().catch(e => { console.error(e); process.exit(1); });
