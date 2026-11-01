/**
 * EllipsisLM Default Location Painterly Image Generator
 * Renders 13 high-resolution (1280x720, 16:9) painterly concept art backgrounds:
 * 1. Modern City
 * 2. Fantasy City
 * 3. River
 * 4. Lake
 * 5. Castle
 * 6. Suburban house
 * 7. Country House
 * 8. Living room
 * 9. Bedroom
 * 10. Kitchen
 * 11. Tavern interior
 * 12. Mountains
 * 13. Valley
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(__dirname, '../assets/locations/defaults');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const LOCATIONS = [
  {
    id: 'modern_city',
    filename: 'modern_city.jpg',
    title: 'Modern City',
    type: 'outdoor_city',
    palette: {
      skyTop: '#0b132b', skyMid: '#1c2541', skyLow: '#3a506b',
      accent1: '#f77f00', accent2: '#fcbf49', coolAccent: '#00b4d8',
      ground1: '#070a13', ground2: '#121826'
    }
  },
  {
    id: 'fantasy_city',
    filename: 'fantasy_city.jpg',
    title: 'Fantasy City',
    type: 'outdoor_fantasy',
    palette: {
      skyTop: '#12002b', skyMid: '#2d0c5a', skyLow: '#5e1b88',
      accent1: '#a855f7', accent2: '#f43f5e', coolAccent: '#38bdf8',
      ground1: '#110726', ground2: '#1e0f3d'
    }
  },
  {
    id: 'river',
    filename: 'river.jpg',
    title: 'River',
    type: 'outdoor_nature',
    palette: {
      skyTop: '#1b3b36', skyMid: '#285943', skyLow: '#4c7c59',
      accent1: '#e9c46a', accent2: '#f4a261', coolAccent: '#2a9d8f',
      ground1: '#0f241d', ground2: '#18382b'
    }
  },
  {
    id: 'lake',
    filename: 'lake.jpg',
    title: 'Lake',
    type: 'outdoor_nature',
    palette: {
      skyTop: '#0d1b2a', skyMid: '#1b263b', skyLow: '#415a77',
      accent1: '#e0e1dd', accent2: '#778da9', coolAccent: '#48cae4',
      ground1: '#08111d', ground2: '#132238'
    }
  },
  {
    id: 'castle',
    filename: 'castle.jpg',
    title: 'Castle',
    type: 'outdoor_castle',
    palette: {
      skyTop: '#191528', skyMid: '#2f2842', skyLow: '#534568',
      accent1: '#d4af37', accent2: '#e67e22', coolAccent: '#6c5ce7',
      ground1: '#120f1c', ground2: '#1e1a2d'
    }
  },
  {
    id: 'suburban_house',
    filename: 'suburban_house.jpg',
    title: 'Suburban House',
    type: 'outdoor_suburban',
    palette: {
      skyTop: '#14213d', skyMid: '#2b3a67', skyLow: '#4f5d88',
      accent1: '#fca311', accent2: '#ffb703', coolAccent: '#8ecae6',
      ground1: '#0a1120', ground2: '#18243b'
    }
  },
  {
    id: 'country_house',
    filename: 'country_house.jpg',
    title: 'Country House',
    type: 'outdoor_rural',
    palette: {
      skyTop: '#1a2e1d', skyMid: '#314e35', skyLow: '#606c38',
      accent1: '#dda15e', accent2: '#bc6c25', coolAccent: '#a3b18a',
      ground1: '#121f14', ground2: '#1c2d1e'
    }
  },
  {
    id: 'living_room',
    filename: 'living_room.jpg',
    title: 'Living Room',
    type: 'interior_cozy',
    palette: {
      wallTop: '#2b1b17', wallMid: '#3d2620', wallLow: '#4a2e26',
      accent1: '#ff9e00', accent2: '#ff6000', coolAccent: '#606c38',
      ground1: '#1c100c', ground2: '#281712'
    }
  },
  {
    id: 'bedroom',
    filename: 'bedroom.jpg',
    title: 'Bedroom',
    type: 'interior_bedroom',
    palette: {
      wallTop: '#101528', wallMid: '#1a203d', wallLow: '#273059',
      accent1: '#ffb703', accent2: '#fb8500', coolAccent: '#8ecae6',
      ground1: '#0c0f1d', ground2: '#161c33'
    }
  },
  {
    id: 'kitchen',
    filename: 'kitchen.jpg',
    title: 'Kitchen',
    type: 'interior_kitchen',
    palette: {
      wallTop: '#2c1e19', wallMid: '#442d25', wallLow: '#5d3d33',
      accent1: '#ffb703', accent2: '#d4a373', coolAccent: '#ccd5ae',
      ground1: '#1d130f', ground2: '#2a1a15'
    }
  },
  {
    id: 'tavern_interior',
    filename: 'tavern_interior.jpg',
    title: 'Tavern Interior',
    type: 'interior_tavern',
    palette: {
      wallTop: '#22110c', wallMid: '#381c13', wallLow: '#4e281b',
      accent1: '#ff9900', accent2: '#ff5500', coolAccent: '#d4a373',
      ground1: '#180a06', ground2: '#241009'
    }
  },
  {
    id: 'mountains',
    filename: 'mountains.jpg',
    title: 'Mountains',
    type: 'outdoor_mountains',
    palette: {
      skyTop: '#0b1d3a', skyMid: '#1c3d5a', skyLow: '#3f6c8d',
      accent1: '#fdf0d5', accent2: '#c6d8d3', coolAccent: '#669bbc',
      ground1: '#071224', ground2: '#102340'
    }
  },
  {
    id: 'valley',
    filename: 'valley.jpg',
    title: 'Valley',
    type: 'outdoor_valley',
    palette: {
      skyTop: '#143642', skyMid: '#26545b', skyLow: '#507c77',
      accent1: '#f4d06f', accent2: '#e76f51', coolAccent: '#52b788',
      ground1: '#0e242c', ground2: '#1b3b3b'
    }
  },
  {
    id: 'forest',
    filename: 'forest.jpg',
    title: 'Forest / Woods',
    type: 'outdoor_forest',
    palette: {
      skyTop: '#0d2618', skyMid: '#1b4332', skyLow: '#2d6a4f',
      accent1: '#e9c46a', accent2: '#95d5b2', coolAccent: '#52b788',
      ground1: '#081c15', ground2: '#122a1e'
    }
  },
  {
    id: 'coast',
    filename: 'coast.jpg',
    title: 'Coast / Beach / Harbor',
    type: 'outdoor_coast',
    palette: {
      skyTop: '#1d3557', skyMid: '#457b9d', skyLow: '#f4a261',
      accent1: '#e76f51', accent2: '#e9c46a', coolAccent: '#a8dadc',
      ground1: '#0d1b2a', ground2: '#2a9d8f'
    }
  },
  {
    id: 'cave_dungeon',
    filename: 'cave_dungeon.jpg',
    title: 'Cave / Underground / Dungeon',
    type: 'interior_cave',
    palette: {
      skyTop: '#090c15', skyMid: '#141b2d', skyLow: '#1f2942',
      accent1: '#00f5d4', accent2: '#ff9e00', coolAccent: '#7209b7',
      ground1: '#05070c', ground2: '#0f1422'
    }
  },
  {
    id: 'ruins_temple',
    filename: 'ruins_temple.jpg',
    title: 'Ruins / Ancient Temple',
    type: 'outdoor_ruins',
    palette: {
      skyTop: '#1b2d2a', skyMid: '#344e41', skyLow: '#a3b18a',
      accent1: '#dad7cd', accent2: '#fca311', coolAccent: '#588157',
      ground1: '#13201d', ground2: '#22332c'
    }
  },
  {
    id: 'desert_wasteland',
    filename: 'desert_wasteland.jpg',
    title: 'Desert / Wasteland / Canyon',
    type: 'outdoor_desert',
    palette: {
      skyTop: '#3d1308', skyMid: '#7f2b12', skyLow: '#e07a5f',
      accent1: '#f4a261', accent2: '#e9c46a', coolAccent: '#81b29a',
      ground1: '#260b04', ground2: '#5c200e'
    }
  },
  {
    id: 'campsite',
    filename: 'campsite.jpg',
    title: 'Camp / Wilderness Outpost',
    type: 'outdoor_camp',
    palette: {
      skyTop: '#070b19', skyMid: '#111b36', skyLow: '#1d2d50',
      accent1: '#ff7b00', accent2: '#ffb703', coolAccent: '#48cae4',
      ground1: '#050811', ground2: '#0e1726'
    }
  },
  {
    id: 'library_study',
    filename: 'library_study.jpg',
    title: 'Library / Study / Archive',
    type: 'interior_library',
    palette: {
      wallTop: '#1a0f0a', wallMid: '#2c1911', wallLow: '#3d2419',
      accent1: '#ffb703', accent2: '#d4a373', coolAccent: '#2a9d8f',
      ground1: '#120a06', ground2: '#21130d'
    }
  },
  {
    id: 'cafe_diner',
    filename: 'cafe_diner.jpg',
    title: 'Cafe / Diner / Restaurant',
    type: 'interior_cafe',
    palette: {
      wallTop: '#1f1614', wallMid: '#362623', wallLow: '#4f3833',
      accent1: '#ff9f1c', accent2: '#e71d36', coolAccent: '#2ec4b6',
      ground1: '#140e0d', ground2: '#261b19'
    }
  },
  {
    id: 'office_lab',
    filename: 'office_lab.jpg',
    title: 'Office / Lab / Modern Interior',
    type: 'interior_lab',
    palette: {
      wallTop: '#0b1320', wallMid: '#16243b', wallLow: '#223656',
      accent1: '#00bbf9', accent2: '#00f5d4', coolAccent: '#f15bb5',
      ground1: '#070c14', ground2: '#101a2b'
    }
  },
  {
    id: 'street_market',
    filename: 'street_market.jpg',
    title: 'Street / Market / Alleyway',
    type: 'outdoor_market',
    palette: {
      skyTop: '#151126', skyMid: '#292047', skyLow: '#473366',
      accent1: '#ff9e00', accent2: '#ff006e', coolAccent: '#3a86ff',
      ground1: '#0d0a18', ground2: '#1b1530'
    }
  },
  {
    id: 'space_station',
    filename: 'space_station.jpg',
    title: 'Space Station / Starship Interior',
    type: 'interior_space',
    palette: {
      wallTop: '#04060d', wallMid: '#0b1021', wallLow: '#16203d',
      accent1: '#00f5d4', accent2: '#ff6b35', coolAccent: '#4cc9f0',
      ground1: '#020307', ground2: '#080c18'
    }
  }
];

function generateSceneScript(loc) {
  return `
  (function() {
    const canvas = document.getElementById('paintCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Pseudo-random seeded generator
    let seed = 42;
    for (let c of "${loc.id}") seed = (seed * 31 + c.charCodeAt(0)) & 0xffffffff;
    function rand() {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return ((seed >>> 0) / 4294967296);
    }
    function randRange(min, max) { return min + rand() * (max - min); }

    // Painterly Brush Stroke Helpers
    function brushDab(x, y, rx, ry, angle, color, opacity = 0.8) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function painterlyWash(x1, y1, x2, y2, color1, color2) {
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, color1);
      grad.addColorStop(1, color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function addCanvasTexture() {
      const imgData = ctx.getImageData(0, 0, W, H);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const noise = (rand() - 0.5) * 14;
        d[i] = Math.min(255, Math.max(0, d[i] + noise));
        d[i+1] = Math.min(255, Math.max(0, d[i+1] + noise));
        d[i+2] = Math.min(255, Math.max(0, d[i+2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      // Painterly brush bristle streaks
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.08;
      for (let i = 0; i < 700; i++) {
        const x = randRange(0, W);
        const y = randRange(0, H);
        const len = randRange(15, 60);
        const ang = randRange(-0.3, 0.3);
        ctx.strokeStyle = rand() > 0.5 ? '#fff' : '#000';
        ctx.lineWidth = randRange(1, 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawVignette(strength = 0.45) {
      ctx.save();
      const radGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.72);
      radGrad.addColorStop(0, 'rgba(0,0,0,0)');
      radGrad.addColorStop(1, 'rgba(3, 4, 8, ' + strength + ')');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // SCENE DISPATCH
    const locId = "${loc.id}";
    const pal = ${JSON.stringify(loc.palette)};

    if (locId === 'modern_city') {
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(0.45, pal.skyMid);
      sky.addColorStop(0.75, pal.skyLow);
      sky.addColorStop(1, pal.ground1);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Twilight clouds
      for (let i = 0; i < 35; i++) {
        brushDab(randRange(0, W), randRange(40, 280), randRange(60, 220), randRange(15, 45), randRange(-0.1, 0.1), '#f77f00', randRange(0.06, 0.18));
        brushDab(randRange(0, W), randRange(60, 320), randRange(50, 180), randRange(12, 35), randRange(-0.1, 0.1), '#3a506b', randRange(0.1, 0.25));
      }

      // Distant Skyline
      for (let x = 0; x < W; x += randRange(12, 28)) {
        const bw = randRange(18, 45);
        const bh = randRange(180, 420);
        ctx.fillStyle = '#1c2541';
        ctx.globalAlpha = 0.65;
        ctx.fillRect(x, H - 180 - bh, bw, bh + 180);
      }

      // Midground Skyscrapers with textured lit windows
      for (let x = -20; x < W + 40; x += randRange(35, 75)) {
        const bw = randRange(45, 95);
        const bh = randRange(260, 560);
        const by = H - 100 - bh;
        ctx.fillStyle = '#0f172a';
        ctx.globalAlpha = 0.95;
        ctx.fillRect(x, by, bw, bh + 100);

        // Building edge rim light
        ctx.fillStyle = pal.accent1;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x, by, 3, bh);

        // Window grid flecks (loose brushy blocks)
        for (let wy = by + 25; wy < H - 140; wy += randRange(12, 24)) {
          for (let wx = x + 8; wx < x + bw - 10; wx += randRange(10, 18)) {
            if (rand() > 0.4) {
              const winCol = rand() > 0.3 ? pal.accent2 : pal.coolAccent;
              brushDab(wx, wy, randRange(2, 5), randRange(3, 7), 0, winCol, randRange(0.35, 0.85));
            }
          }
        }
      }

      // Elevated highway / flyover in foreground
      ctx.save();
      ctx.fillStyle = '#090d16';
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(-20, H - 80);
      ctx.bezierCurveTo(W * 0.3, H - 130, W * 0.7, H - 70, W + 20, H - 140);
      ctx.lineTo(W + 20, H);
      ctx.lineTo(-20, H);
      ctx.closePath();
      ctx.fill();

      // Flowing traffic light streaks (red tail lights, golden head lights)
      for (let s = 0; s < 45; s++) {
        const t = rand();
        const sx = t * W;
        const sy = (H - 80) * (1 - t) + (H - 140) * t - Math.sin(t * Math.PI) * 35 + randRange(-8, 8);
        const col = rand() > 0.45 ? '#ff3333' : '#ffea75';
        ctx.strokeStyle = col;
        ctx.lineWidth = randRange(2, 5);
        ctx.globalAlpha = randRange(0.5, 0.9);
        ctx.beginPath();
        ctx.moveTo(sx - 35, sy + randRange(-2, 2));
        ctx.lineTo(sx + 35, sy);
        ctx.stroke();
      }
      ctx.restore();

    } else if (locId === 'fantasy_city') {
      // Sky with ethereal twin moons and nebula haze
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(0.5, pal.skyMid);
      sky.addColorStop(0.85, pal.skyLow);
      sky.addColorStop(1, pal.ground1);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Large luminous fantasy moon
      const moonGrad = ctx.createRadialGradient(W * 0.75, 160, 10, W * 0.75, 160, 110);
      moonGrad.addColorStop(0, '#fdf4ff');
      moonGrad.addColorStop(0.35, '#e879f9');
      moonGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.25)');
      moonGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(W * 0.75, 160, 110, 0, Math.PI * 2);
      ctx.fill();

      // Second smaller crescent moon
      ctx.save();
      ctx.fillStyle = '#67e8f9';
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(W * 0.32, 110, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(W * 0.32 + 10, 106, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soaring elegant crystal fantasy spires
      const spires = [
        { x: W * 0.15, w: 45, h: 460 },
        { x: W * 0.28, w: 65, h: 580 },
        { x: W * 0.48, w: 85, h: 640 },
        { x: W * 0.65, w: 55, h: 520 },
        { x: W * 0.82, w: 70, h: 480 }
      ];

      for (let s of spires) {
        // Spire silhouette
        ctx.fillStyle = '#1c0f38';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(s.x, H - 80);
        ctx.lineTo(s.x + s.w / 2, H - 80 - s.h);
        ctx.lineTo(s.x + s.w, H - 80);
        ctx.closePath();
        ctx.fill();

        // Glowing crystal tip
        brushDab(s.x + s.w / 2, H - 80 - s.h, 24, 24, 0, pal.coolAccent, 0.75);
        brushDab(s.x + s.w / 2, H - 80 - s.h, 8, 8, 0, '#ffffff', 0.95);

        // Ornate glowing arches
        ctx.strokeStyle = pal.accent1;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6;
        for (let y = H - 80 - s.h + 80; y < H - 120; y += 70) {
          ctx.beginPath();
          ctx.arc(s.x + s.w / 2, y, s.w * 0.4, Math.PI, 0);
          ctx.stroke();
        }
      }

      // Grand viaduct / bridges connecting spires
      ctx.fillStyle = '#160b2e';
      ctx.globalAlpha = 0.95;
      for (let i = 0; i < 3; i++) {
        const by = H - 240 + i * 60;
        ctx.fillRect(0, by, W, 14);
        for (let bx = 40; bx < W; bx += 110) {
          ctx.beginPath();
          ctx.arc(bx, by + 14, 35, Math.PI, 0);
          ctx.fill();
        }
      }

      // Ethereal magic mist in lower tier
      for (let i = 0; i < 40; i++) {
        brushDab(randRange(0, W), randRange(H - 220, H), randRange(80, 240), randRange(20, 50), 0, '#c084fc', randRange(0.08, 0.22));
      }

    } else if (locId === 'river') {
      // Sky & lush forest background
      painterlyWash(0, 0, 0, H * 0.6, '#285943', '#4c7c59');

      // Far tree canopy
      for (let x = 0; x < W; x += 25) {
        brushDab(x, randRange(140, 260), randRange(45, 90), randRange(50, 110), 0, '#133526', randRange(0.7, 0.95));
      }

      // Midground riverbanks with boulders
      ctx.fillStyle = '#1e382b';
      ctx.beginPath();
      ctx.moveTo(0, 220);
      ctx.bezierCurveTo(W * 0.35, 260, W * 0.25, 420, 0, H);
      ctx.lineTo(0, 220);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(W, 200);
      ctx.bezierCurveTo(W * 0.65, 270, W * 0.72, 440, W, H);
      ctx.lineTo(W, 200);
      ctx.fill();

      // Winding river surface
      const riverGrad = ctx.createLinearGradient(W * 0.5, 220, W * 0.4, H);
      riverGrad.addColorStop(0, '#2a9d8f');
      riverGrad.addColorStop(0.5, '#264653');
      riverGrad.addColorStop(1, '#1b3b36');
      ctx.fillStyle = riverGrad;
      ctx.beginPath();
      ctx.moveTo(W * 0.42, 210);
      ctx.bezierCurveTo(W * 0.38, 300, W * 0.22, 450, 0, H - 40);
      ctx.lineTo(W, H);
      ctx.bezierCurveTo(W * 0.75, 480, W * 0.62, 310, W * 0.52, 210);
      ctx.closePath();
      ctx.fill();

      // Flowing water brush streaks and rapids foam
      for (let i = 0; i < 65; i++) {
        const ry = randRange(230, H - 20);
        const t = (ry - 230) / (H - 250);
        const rx = (W * 0.46) * (1 - t) + (W * 0.48) * t + randRange(-120 * (1 + t * 2), 120 * (1 + t * 2));
        ctx.strokeStyle = rand() > 0.4 ? '#e9c46a' : '#ffffff';
        ctx.lineWidth = randRange(1.5, 4.5);
        ctx.globalAlpha = randRange(0.2, 0.65);
        ctx.beginPath();
        ctx.moveTo(rx - randRange(15, 45), ry);
        ctx.lineTo(rx + randRange(15, 45), ry + randRange(-3, 3));
        ctx.stroke();
      }

      // Riverbank stones and sunlit foliage
      for (let i = 0; i < 50; i++) {
        const sx = rand() > 0.5 ? randRange(0, W * 0.28) : randRange(W * 0.72, W);
        const sy = randRange(320, H);
        brushDab(sx, sy, randRange(15, 45), randRange(10, 25), randRange(-0.3, 0.3), '#264653', 0.85);
        brushDab(sx, sy - 8, randRange(8, 22), randRange(4, 12), 0, '#dda15e', 0.45);
      }

    } else if (locId === 'lake') {
      // Twilight Sky & Mirror Lake
      painterlyWash(0, 0, 0, H * 0.52, pal.skyTop, pal.skyLow);

      // Distant misty mountains across lake
      ctx.fillStyle = '#1c283c';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.48);
      ctx.lineTo(W * 0.2, H * 0.28);
      ctx.lineTo(W * 0.45, H * 0.42);
      ctx.lineTo(W * 0.7, H * 0.24);
      ctx.lineTo(W, H * 0.44);
      ctx.lineTo(W, H * 0.52);
      ctx.lineTo(0, H * 0.52);
      ctx.closePath();
      ctx.fill();

      // Atmospheric lake haze
      for (let i = 0; i < 20; i++) {
        brushDab(randRange(0, W), H * 0.48 + randRange(-15, 15), randRange(120, 320), randRange(15, 35), 0, '#778da9', 0.22);
      }

      // Calm water surface with reflection
      const lakeGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
      lakeGrad.addColorStop(0, '#1b263b');
      lakeGrad.addColorStop(0.5, '#0d1b2a');
      lakeGrad.addColorStop(1, '#08111d');
      ctx.fillStyle = lakeGrad;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);

      // Horizontal water ripples
      for (let y = H * 0.52; y < H; y += randRange(8, 22)) {
        ctx.strokeStyle = rand() > 0.6 ? '#48cae4' : '#778da9';
        ctx.lineWidth = randRange(1, 3);
        ctx.globalAlpha = randRange(0.18, 0.5);
        ctx.beginPath();
        const rx = randRange(0, W);
        const rlen = randRange(40, 260);
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rlen, y);
        ctx.stroke();
      }

      // Wooden jetty / dock extending into the lake in foreground
      ctx.save();
      ctx.fillStyle = '#18120c';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(W * 0.38, H);
      ctx.lineTo(W * 0.44, H * 0.64);
      ctx.lineTo(W * 0.54, H * 0.64);
      ctx.lineTo(W * 0.60, H);
      ctx.closePath();
      ctx.fill();

      // Jetty planks
      ctx.strokeStyle = '#3d2b1f';
      ctx.lineWidth = 3;
      for (let py = H * 0.66; py < H; py += 16) {
        const t = (py - H * 0.64) / (H - H * 0.64);
        const lx = W * 0.44 * (1 - t) + W * 0.38 * t;
        const rx = W * 0.54 * (1 - t) + W * 0.60 * t;
        ctx.beginPath();
        ctx.moveTo(lx, py);
        ctx.lineTo(rx, py);
        ctx.stroke();
      }
      ctx.restore();

    } else if (locId === 'castle') {
      // Dramatic overcast sunset sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(0.4, pal.skyMid);
      sky.addColorStop(0.7, '#d4af37');
      sky.addColorStop(1, pal.ground1);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Dramatic sun rays breaking clouds
      ctx.save();
      ctx.fillStyle = 'rgba(255, 235, 150, 0.12)';
      for (let ang of [-0.4, -0.2, 0.05, 0.25, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(W * 0.5, 120);
        ctx.lineTo(W * 0.5 + Math.tan(ang - 0.08) * H, H);
        ctx.lineTo(W * 0.5 + Math.tan(ang + 0.08) * H, H);
        ctx.fill();
      }
      ctx.restore();

      // Massive craggy cliff base
      ctx.fillStyle = '#13111b';
      ctx.beginPath();
      ctx.moveTo(W * 0.18, H);
      ctx.lineTo(W * 0.26, H * 0.56);
      ctx.lineTo(W * 0.78, H * 0.54);
      ctx.lineTo(W * 0.88, H);
      ctx.closePath();
      ctx.fill();

      // Castle Main Keep & Towers
      const castleTowers = [
        { x: W * 0.28, w: 75, h: 280 },
        { x: W * 0.42, w: 120, h: 360 }, // central keep
        { x: W * 0.62, w: 85, h: 310 },
        { x: W * 0.74, w: 60, h: 250 }
      ];

      for (let t of castleTowers) {
        // Stone tower body
        ctx.fillStyle = '#1e1a2b';
        ctx.globalAlpha = 1.0;
        const ty = H * 0.56 - t.h;
        ctx.fillRect(t.x, ty, t.w, t.h + 20);

        // Tower battlements / crenellations
        const cWidth = t.w / 7;
        for (let c = 0; c < 7; c += 2) {
          ctx.fillRect(t.x + c * cWidth, ty - 18, cWidth, 18);
        }

        // Conical turret roof for side towers
        if (t.w < 100) {
          ctx.fillStyle = '#4a1525';
          ctx.beginPath();
          ctx.moveTo(t.x - 6, ty - 18);
          ctx.lineTo(t.x + t.w / 2, ty - 85);
          ctx.lineTo(t.x + t.w + 6, ty - 18);
          ctx.closePath();
          ctx.fill();

          // Castle pennant banner
          ctx.strokeStyle = '#d4af37';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(t.x + t.w / 2, ty - 85);
          ctx.lineTo(t.x + t.w / 2, ty - 110);
          ctx.stroke();

          ctx.fillStyle = '#e67e22';
          ctx.beginPath();
          ctx.moveTo(t.x + t.w / 2, ty - 110);
          ctx.lineTo(t.x + t.w / 2 + 25, ty - 100);
          ctx.lineTo(t.x + t.w / 2, ty - 90);
          ctx.fill();
        }

        // Warm torchlight in arrow slits
        for (let wy = ty + 60; wy < ty + t.h - 40; wy += 55) {
          brushDab(t.x + t.w / 2, wy, 4, 12, 0, '#ffbe0b', 0.9);
          brushDab(t.x + t.w / 2, wy, 16, 20, 0, '#ff9e00', 0.35);
        }
      }

      // Connecting stone curtain wall
      ctx.fillStyle = '#171422';
      ctx.fillRect(W * 0.25, H * 0.56 - 160, W * 0.54, 160);

    } else if (locId === 'suburban_house') {
      // Twilight neighborhood sky
      painterlyWash(0, 0, 0, H * 0.65, pal.skyTop, pal.skyLow);

      // Silhouette of neighborhood trees
      for (let x = -20; x < W + 20; x += 35) {
        brushDab(x, randRange(H * 0.35, H * 0.52), randRange(40, 95), randRange(45, 100), 0, '#0f172a', 0.7);
      }

      // Front lawn & driveway
      const lawn = ctx.createLinearGradient(0, H * 0.58, 0, H);
      lawn.addColorStop(0, '#1c2833');
      lawn.addColorStop(1, '#0e161c');
      ctx.fillStyle = lawn;
      ctx.fillRect(0, H * 0.58, W, H * 0.42);

      // Two-story Suburban Home Structure
      const hx = W * 0.28;
      const hy = H * 0.32;
      const hw = W * 0.44;
      const hh = H * 0.38;

      // House main siding (slate blue-gray)
      ctx.fillStyle = '#223049';
      ctx.fillRect(hx, hy, hw, hh);

      // Gabled roof
      ctx.fillStyle = '#111927';
      ctx.beginPath();
      ctx.moveTo(hx - 25, hy);
      ctx.lineTo(hx + hw * 0.45, hy - 110);
      ctx.lineTo(hx + hw + 25, hy);
      ctx.closePath();
      ctx.fill();

      // Front porch with columns
      ctx.fillStyle = '#192233';
      ctx.fillRect(hx + hw * 0.28, hy + hh * 0.55, hw * 0.44, hh * 0.45);

      // Porch light glow
      brushDab(hx + hw * 0.5, hy + hh * 0.6, 35, 35, 0, pal.accent1, 0.4);
      brushDab(hx + hw * 0.5, hy + hh * 0.6, 8, 8, 0, '#fff', 0.9);

      // Warm glowing windows (inviting family light)
      const windows = [
        { x: hx + 40, y: hy + 35, w: 45, h: 55 },
        { x: hx + hw - 85, y: hy + 35, w: 45, h: 55 },
        { x: hx + 40, y: hy + hh * 0.55, w: 55, h: 65 },
        { x: hx + hw - 95, y: hy + hh * 0.55, w: 55, h: 65 }
      ];
      for (let w of windows) {
        brushDab(w.x + w.w / 2, w.y + w.h / 2, w.w * 0.9, w.h * 0.9, 0, pal.accent2, 0.3);
        ctx.fillStyle = '#ffd166';
        ctx.globalAlpha = 0.95;
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#223049';
        ctx.lineWidth = 3;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
        ctx.beginPath();
        ctx.moveTo(w.x + w.w / 2, w.y);
        ctx.lineTo(w.x + w.w / 2, w.y + w.h);
        ctx.moveTo(w.x, w.y + w.h / 2);
        ctx.lineTo(w.x + w.w, w.y + w.h / 2);
        ctx.stroke();
      }

      // Concrete walkway with warm light spill
      ctx.fillStyle = '#2a3b4c';
      ctx.beginPath();
      ctx.moveTo(hx + hw * 0.44, hy + hh);
      ctx.lineTo(hx + hw * 0.56, hy + hh);
      ctx.lineTo(W * 0.62, H);
      ctx.lineTo(W * 0.38, H);
      ctx.closePath();
      ctx.fill();

    } else if (locId === 'country_house') {
      // Golden Hour rural sky
      painterlyWash(0, 0, 0, H * 0.55, '#314e35', '#dda15e');

      // Rolling meadows with wildflowers
      const hill1 = ctx.createLinearGradient(0, H * 0.45, 0, H);
      hill1.addColorStop(0, '#606c38');
      hill1.addColorStop(1, '#283618');
      ctx.fillStyle = hill1;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.45);
      ctx.bezierCurveTo(W * 0.3, H * 0.38, W * 0.7, H * 0.52, W, H * 0.44);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // Rustic stone & timber cottage
      const cx = W * 0.34;
      const cy = H * 0.36;
      const cw = W * 0.36;
      const ch = H * 0.34;

      // Stone cottage walls
      ctx.fillStyle = '#3a3429';
      ctx.fillRect(cx, cy, cw, ch);

      // Thatch / wood shake roof
      ctx.fillStyle = '#211c14';
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + 10);
      ctx.lineTo(cx + cw * 0.5, cy - 85);
      ctx.lineTo(cx + cw + 30, cy + 10);
      ctx.closePath();
      ctx.fill();

      // Stone chimney with curling smoke
      ctx.fillStyle = '#2a261f';
      ctx.fillRect(cx + cw * 0.78, cy - 110, 32, 80);

      // Smoke puffs
      for (let s = 0; s < 18; s++) {
        brushDab(cx + cw * 0.8 + randRange(-12, 12) + s * 12, cy - 120 - s * 14, 18 + s * 2, 12 + s, 0, '#dda15e', 0.18 - s * 0.008);
      }

      // Warm cottage windows
      brushDab(cx + 45, cy + ch * 0.4, 22, 28, 0, '#fef08a', 0.95);
      brushDab(cx + cw - 55, cy + ch * 0.4, 22, 28, 0, '#fef08a', 0.95);
      brushDab(cx + 45, cy + ch * 0.4, 45, 45, 0, '#f59e0b', 0.4);

      // Wooden front door
      ctx.fillStyle = '#1c150e';
      ctx.fillRect(cx + cw * 0.44, cy + ch * 0.38, 38, ch * 0.62);

      // Wildflowers across foreground meadow
      for (let f = 0; f < 120; f++) {
        const fx = randRange(0, W);
        const fy = randRange(H * 0.65, H);
        const col = rand() > 0.5 ? '#fef08a' : (rand() > 0.5 ? '#f472b6' : '#60a5fa');
        brushDab(fx, fy, randRange(2, 5), randRange(2, 5), 0, col, 0.8);
      }

    } else if (locId === 'living_room') {
      // Warm room interior wash
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Hardwood floor in perspective
      const floor = ctx.createLinearGradient(0, H * 0.58, 0, H);
      floor.addColorStop(0, '#3d2314');
      floor.addColorStop(1, '#1c0f08');
      ctx.fillStyle = floor;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.58);
      ctx.lineTo(W, H * 0.58);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // Floor planks
      ctx.strokeStyle = '#120a05';
      ctx.lineWidth = 2;
      for (let px = -100; px < W + 200; px += 85) {
        ctx.beginPath();
        ctx.moveTo(px, H * 0.58);
        ctx.lineTo(px + (px - W / 2) * 0.6, H);
        ctx.stroke();
      }

      // Stone Fireplace at center/right
      const fpx = W * 0.62;
      const fpy = H * 0.22;
      const fpw = 260;
      const fph = 320;

      ctx.fillStyle = '#261b18';
      ctx.fillRect(fpx, fpy, fpw, fph);

      // Mantle shelf
      ctx.fillStyle = '#4a2c1d';
      ctx.fillRect(fpx - 20, fpy, fpw + 40, 24);

      // Hearth opening
      ctx.fillStyle = '#0a0503';
      ctx.fillRect(fpx + 45, fpy + 100, fpw - 90, fph - 100);

      // Roaring fire in hearth with glowing light bounce
      for (let flame = 0; flame < 35; flame++) {
        brushDab(fpx + fpw / 2 + randRange(-35, 35), fpy + fph - 40 - randRange(0, 60), randRange(15, 35), randRange(25, 55), randRange(-0.2, 0.2), '#ff7700', randRange(0.4, 0.9));
        brushDab(fpx + fpw / 2 + randRange(-15, 15), fpy + fph - 30 - randRange(0, 45), randRange(10, 22), randRange(15, 35), randRange(-0.1, 0.1), '#ffea00', randRange(0.6, 0.95));
      }
      // Fire glow across entire living room
      brushDab(fpx + fpw / 2, fpy + fph - 40, 360, 280, 0, '#ff9e00', 0.28);

      // Cozy Armchair in foreground left
      const ax = W * 0.18;
      const ay = H * 0.52;
      ctx.fillStyle = '#54261d';
      ctx.beginPath();
      // Armchair back
      ctx.roundRect ? ctx.roundRect(ax, ay - 80, 180, 140, [30, 30, 0, 0]) : ctx.fillRect(ax, ay - 80, 180, 140);
      ctx.fill();

      // Armchair seat cushion
      ctx.fillStyle = '#6b3226';
      ctx.fillRect(ax - 20, ay + 30, 220, 65);

      // Bookshelves along the left wall
      ctx.fillStyle = '#1e130d';
      ctx.fillRect(20, 40, 140, H * 0.54);
      for (let sh = 90; sh < H * 0.54; sh += 65) {
        ctx.fillStyle = '#382216';
        ctx.fillRect(20, sh, 140, 10);
        // Colorful book spines
        for (let bx = 30; bx < 150; bx += randRange(8, 16)) {
          ctx.fillStyle = rand() > 0.5 ? '#8b4513' : (rand() > 0.5 ? '#b22222' : '#2e8b57');
          ctx.fillRect(bx, sh - 45, randRange(6, 12), 45);
        }
      }

    } else if (locId === 'bedroom') {
      // Midnight bedroom with moonlight and warm lamp
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Large window with soft blue moonlight beam
      const wx = W * 0.68;
      const wy = 60;
      const ww = 180;
      const wh = 260;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx, wy, ww, wh);

      // Moonbeam wash across room
      ctx.save();
      const moonbeam = ctx.createLinearGradient(wx, wy, wx - 340, H);
      moonbeam.addColorStop(0, 'rgba(142, 202, 230, 0.4)');
      moonbeam.addColorStop(1, 'rgba(142, 202, 230, 0.0)');
      ctx.fillStyle = moonbeam;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + ww, wy);
      ctx.lineTo(wx - 120, H);
      ctx.lineTo(wx - 360, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Window crossbars
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 6;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2);
      ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();

      // Grand Bed with soft linens and pillows
      const bx = W * 0.16;
      const by = H * 0.44;
      const bw = W * 0.50;
      const bh = H * 0.44;

      // Wooden Headboard
      ctx.fillStyle = '#2b1b17';
      ctx.fillRect(bx, by - 90, bw, 110);

      // Mattress and duvet
      const duvet = ctx.createLinearGradient(bx, by, bx, by + bh);
      duvet.addColorStop(0, '#334155');
      duvet.addColorStop(1, '#1e293b');
      ctx.fillStyle = duvet;
      ctx.fillRect(bx, by + 20, bw, bh);

      // Pillows
      for (let p of [bx + 35, bx + bw * 0.5 + 20]) {
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.ellipse(p + 60, by + 10, 65, 30, -0.05, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bedside Nightstand with warm glowing lantern/lamp
      const nx = bx - 85;
      const ny = H * 0.56;
      ctx.fillStyle = '#1e1410';
      ctx.fillRect(nx, ny, 70, 140);

      // Warm amber bedside lamp glow
      brushDab(nx + 35, ny - 35, 140, 140, 0, pal.accent1, 0.35);
      brushDab(nx + 35, ny - 35, 15, 20, 0, '#fff', 0.95);

    } else if (locId === 'kitchen') {
      // Warm rustic kitchen wash
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Brick cooking hearth / oven at left
      ctx.fillStyle = '#3a2018';
      ctx.fillRect(40, 100, 260, H - 180);

      // Brick texture flecks
      for (let by = 120; by < H - 200; by += 28) {
        for (let bx = 50; bx < 280; bx += 45) {
          ctx.fillStyle = '#4d2a20';
          ctx.fillRect(bx, by, 38, 18);
        }
      }

      // Stove hearth fire glow
      brushDab(170, H - 280, 50, 65, 0, '#ff9900', 0.85);
      brushDab(170, H - 280, 25, 35, 0, '#ffe600', 0.95);
      brushDab(170, H - 280, 180, 180, 0, '#ff6600', 0.3);

      // Open timber shelves with pottery, jars, and spices
      ctx.fillStyle = '#2a1a14';
      ctx.fillRect(W * 0.40, 90, W * 0.54, 16);
      ctx.fillRect(W * 0.40, 190, W * 0.54, 16);

      // Jars & ceramics on shelves
      for (let jx = W * 0.42; jx < W * 0.92; jx += randRange(30, 55)) {
        ctx.fillStyle = rand() > 0.5 ? '#d4a373' : (rand() > 0.5 ? '#ccd5ae' : '#e76f51');
        const jh = randRange(35, 65);
        ctx.fillRect(jx, 190 - jh, randRange(18, 30), jh);
      }

      // Hanging copper pans from ceiling rack
      ctx.strokeStyle = '#1a110c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.45, 30);
      ctx.lineTo(W * 0.85, 30);
      ctx.stroke();

      for (let px = W * 0.50; px < W * 0.82; px += 65) {
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 30);
        ctx.lineTo(px, 60);
        ctx.stroke();

        brushDab(px, 75, 20, 20, 0, '#ca6702', 0.9);
        brushDab(px - 4, 72, 8, 8, 0, '#fef08a', 0.6); // copper metallic glint
      }

      // Central wooden rustic prep table
      const tx = W * 0.35;
      const ty = H * 0.54;
      const tw = W * 0.52;
      const th = 160;

      ctx.fillStyle = '#382216';
      ctx.fillRect(tx, ty, tw, 28);
      ctx.fillStyle = '#26160e';
      ctx.fillRect(tx + 20, ty + 28, 22, th);
      ctx.fillRect(tx + tw - 42, ty + 28, 22, th);

      // Bowl of fruit / bread on table
      brushDab(tx + tw * 0.5, ty - 10, 45, 18, 0, '#d4a373', 0.95);
      brushDab(tx + tw * 0.46, ty - 18, 12, 12, 0, '#e63946', 0.9);
      brushDab(tx + tw * 0.54, ty - 18, 14, 14, 0, '#f4a261', 0.9);

    } else if (locId === 'tavern_interior') {
      // Hearthstone-style atmospheric medieval tavern common room
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Heavy timber ceiling beams
      ctx.fillStyle = '#1c0c08';
      for (let bx = 0; bx < W; bx += 180) {
        ctx.fillRect(bx, 0, 36, H * 0.35);
      }
      ctx.fillRect(0, 40, W, 32);

      // Massive stone hearth fireplace in center-left
      const fpx = W * 0.22;
      const fpy = H * 0.16;
      ctx.fillStyle = '#2d1810';
      ctx.fillRect(fpx, fpy, 320, H * 0.6);

      // Hearth arch
      ctx.fillStyle = '#080302';
      ctx.beginPath();
      ctx.arc(fpx + 160, fpy + 180, 110, Math.PI, 0);
      ctx.lineTo(fpx + 270, fpy + 320);
      ctx.lineTo(fpx + 50, fpy + 320);
      ctx.closePath();
      ctx.fill();

      // Roaring tavern hearthfire
      for (let i = 0; i < 45; i++) {
        brushDab(fpx + 160 + randRange(-50, 50), fpy + 300 - randRange(10, 110), randRange(20, 50), randRange(30, 80), randRange(-0.25, 0.25), '#ff6600', randRange(0.4, 0.9));
        brushDab(fpx + 160 + randRange(-25, 25), fpy + 290 - randRange(10, 80), randRange(12, 30), randRange(20, 50), randRange(-0.15, 0.15), '#ffdd00', randRange(0.6, 0.95));
      }
      // Big warm tavern glow
      brushDab(fpx + 160, fpy + 260, 420, 340, 0, '#f59e0b', 0.32);

      // Wooden tavern bar counter on the right
      const rx = W * 0.62;
      const ry = H * 0.44;
      ctx.fillStyle = '#3b1c11';
      ctx.fillRect(rx, ry, W - rx, 40);
      ctx.fillStyle = '#22100a';
      ctx.fillRect(rx, ry + 40, W - rx, H - ry);

      // Ale barrels stacked behind bar
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = '#4a2516';
        ctx.beginPath();
        ctx.ellipse(rx + 60 + b * 65, ry - 40, 28, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a0c06';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Wooden table and ale tankards in foreground
      ctx.fillStyle = '#442114';
      ctx.beginPath();
      ctx.ellipse(W * 0.44, H - 30, 220, 75, 0, 0, Math.PI * 2);
      ctx.fill();

      // Frothing pewter ale tankards
      for (let tx of [W * 0.38, W * 0.48]) {
        ctx.fillStyle = '#78716c';
        ctx.fillRect(tx, H - 110, 32, 45);
        // Froth head
        brushDab(tx + 16, H - 112, 18, 12, 0, '#fef08a', 0.95);
      }

      // Hanging iron lanterns
      ctx.strokeStyle = '#180a06';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.72, 72);
      ctx.lineTo(W * 0.72, 140);
      ctx.stroke();
      brushDab(W * 0.72, 155, 65, 65, 0, '#ff9900', 0.45);
      brushDab(W * 0.72, 155, 12, 16, 0, '#ffffff', 0.95);

    } else if (locId === 'mountains') {
      // Cold alpine dawn sky
      painterlyWash(0, 0, 0, H * 0.55, pal.skyTop, pal.skyLow);

      // Sunburst rim light behind peak
      brushDab(W * 0.52, H * 0.24, 280, 280, 0, '#fde047', 0.28);
      brushDab(W * 0.52, H * 0.24, 90, 90, 0, '#ffffff', 0.75);

      // Far jagged peaks
      ctx.fillStyle = '#1c3d5a';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.55);
      ctx.lineTo(W * 0.18, H * 0.28);
      ctx.lineTo(W * 0.34, H * 0.42);
      ctx.lineTo(W * 0.52, H * 0.16); // Central peak
      ctx.lineTo(W * 0.72, H * 0.38);
      ctx.lineTo(W * 0.88, H * 0.22);
      ctx.lineTo(W, H * 0.50);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // Snow on the peak illuminated by golden sun
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(W * 0.52, H * 0.16);
      ctx.lineTo(W * 0.46, H * 0.30);
      ctx.lineTo(W * 0.52, H * 0.28);
      ctx.lineTo(W * 0.56, H * 0.32);
      ctx.closePath();
      ctx.fill();

      // Sea of billowing clouds beneath summits
      for (let c = 0; c < 50; c++) {
        brushDab(randRange(0, W), randRange(H * 0.45, H * 0.65), randRange(100, 260), randRange(25, 60), 0, '#cbd5e1', randRange(0.25, 0.65));
      }

      // Foreground rugged crags
      ctx.fillStyle = '#0f172a';
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H * 0.65);
      ctx.lineTo(W * 0.35, H * 0.82);
      ctx.lineTo(W * 0.68, H * 0.72);
      ctx.lineTo(W, H * 0.58);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

    } else if (locId === 'valley') {
      // Golden pastoral dawn sky
      painterlyWash(0, 0, 0, H * 0.55, pal.skyTop, pal.skyLow);

      // Distant rolling mountain ridges
      ctx.fillStyle = '#26545b';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.48);
      ctx.bezierCurveTo(W * 0.3, H * 0.32, W * 0.6, H * 0.44, W, H * 0.34);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // Verdant green valley slopes on left & right
      const slope1 = ctx.createLinearGradient(0, H * 0.38, 0, H);
      slope1.addColorStop(0, '#52b788');
      slope1.addColorStop(1, '#1b4332');
      ctx.fillStyle = slope1;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.35);
      ctx.bezierCurveTo(W * 0.35, H * 0.52, W * 0.4, H * 0.78, 0, H);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(W, H * 0.32);
      ctx.bezierCurveTo(W * 0.65, H * 0.54, W * 0.6, H * 0.82, W, H);
      ctx.closePath();
      ctx.fill();

      // Valley floor meadow bathed in warm morning light
      const meadow = ctx.createLinearGradient(W * 0.5, H * 0.5, W * 0.5, H);
      meadow.addColorStop(0, '#74c69d');
      meadow.addColorStop(1, '#2d6a4f');
      ctx.fillStyle = meadow;
      ctx.beginPath();
      ctx.moveTo(W * 0.44, H * 0.50);
      ctx.lineTo(W * 0.56, H * 0.50);
      ctx.lineTo(W * 0.75, H);
      ctx.lineTo(W * 0.25, H);
      ctx.closePath();
      ctx.fill();

      // Winding small creek through valley center
      ctx.strokeStyle = '#a7c957';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(W * 0.50, H * 0.50);
      ctx.bezierCurveTo(W * 0.47, H * 0.65, W * 0.54, H * 0.82, W * 0.48, H);
      ctx.stroke();

      // Wildflower flecks in foreground
      for (let f = 0; f < 150; f++) {
        const fx = randRange(W * 0.1, W * 0.9);
        const fy = randRange(H * 0.70, H);
        brushDab(fx, fy, randRange(2, 6), randRange(2, 6), 0, rand() > 0.5 ? '#f4d06f' : '#e76f51', 0.85);
      }

    } else if (locId === 'forest') {
      // Deep ancient woodland wash
      painterlyWash(0, 0, 0, H, pal.skyTop, pal.ground1);

      // Golden sunbeams filtering diagonally through the canopy
      ctx.save();
      for (let b = 0; b < 6; b++) {
        const bx = W * 0.18 + b * 150;
        const beamGrad = ctx.createLinearGradient(bx, 0, bx + 220, H);
        beamGrad.addColorStop(0, 'rgba(233, 196, 106, 0.26)');
        beamGrad.addColorStop(0.7, 'rgba(149, 213, 178, 0.10)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + 90, 0);
        ctx.lineTo(bx + 320, H);
        ctx.lineTo(bx + 140, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Background misty trunks
      for (let tx = 30; tx < W; tx += randRange(55, 95)) {
        ctx.fillStyle = '#143325';
        ctx.globalAlpha = 0.65;
        ctx.fillRect(tx, 0, randRange(18, 36), H * 0.78);
      }

      // Mossy forest floor and winding earthen trail
      const floorGrad = ctx.createLinearGradient(0, H * 0.62, 0, H);
      floorGrad.addColorStop(0, '#1b4332');
      floorGrad.addColorStop(1, '#081c15');
      ctx.fillStyle = floorGrad;
      ctx.globalAlpha = 1.0;
      ctx.fillRect(0, H * 0.62, W, H * 0.38);

      // Winding mossy path
      ctx.fillStyle = '#3a2e21';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(W * 0.45, H * 0.62);
      ctx.bezierCurveTo(W * 0.40, H * 0.75, W * 0.58, H * 0.88, W * 0.36, H);
      ctx.lineTo(W * 0.64, H);
      ctx.bezierCurveTo(W * 0.70, H * 0.86, W * 0.52, H * 0.74, W * 0.54, H * 0.62);
      ctx.closePath();
      ctx.fill();

      // Towering foreground tree trunks with mossy rim light
      const trunks = [W * 0.08, W * 0.24, W * 0.74, W * 0.90];
      for (let tx of trunks) {
        const tw = randRange(55, 85);
        ctx.fillStyle = '#120f0d';
        ctx.globalAlpha = 0.96;
        ctx.fillRect(tx, 0, tw, H);
        // Sunlit moss edge
        ctx.fillStyle = '#52b788';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(tx + tw - 8, 60, 8, H - 120);
      }

      // Lush canopy foliage dabs and ferns
      for (let i = 0; i < 95; i++) {
        const fx = randRange(0, W);
        const fy = randRange(0, H * 0.42);
        const col = rand() > 0.35 ? '#2d6a4f' : (rand() > 0.5 ? '#52b788' : '#e9c46a');
        brushDab(fx, fy, randRange(35, 95), randRange(20, 55), randRange(-0.3, 0.3), col, randRange(0.35, 0.8));
      }
      for (let f = 0; f < 70; f++) {
        brushDab(randRange(0, W), randRange(H * 0.68, H), randRange(18, 48), randRange(8, 20), randRange(-0.2, 0.2), '#40916c', 0.75);
      }

    } else if (locId === 'coast') {
      // Sunset coastal sky
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.52);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(0.55, pal.skyMid);
      sky.addColorStop(1, pal.skyLow);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.52);

      // Setting sun on horizon
      brushDab(W * 0.62, H * 0.46, 130, 90, 0, '#f4a261', 0.45);
      brushDab(W * 0.62, H * 0.48, 48, 48, 0, '#fff3b0', 0.9);

      // Turquoise & deep blue ocean water
      const sea = ctx.createLinearGradient(0, H * 0.50, 0, H);
      sea.addColorStop(0, '#1d3557');
      sea.addColorStop(0.45, '#2a9d8f');
      sea.addColorStop(1, '#e9c46a');
      ctx.fillStyle = sea;
      ctx.fillRect(0, H * 0.50, W, H * 0.50);

      // Sweeping sandy beach curve on right-foreground
      ctx.fillStyle = '#d4a373';
      ctx.beginPath();
      ctx.moveTo(W * 0.32, H);
      ctx.bezierCurveTo(W * 0.45, H * 0.76, W * 0.75, H * 0.68, W, H * 0.62);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // White surf foam lines along shoreline
      ctx.strokeStyle = '#ffffff';
      for (let w = 0; w < 5; w++) {
        ctx.lineWidth = 4 - w * 0.6;
        ctx.globalAlpha = 0.75 - w * 0.12;
        ctx.beginPath();
        ctx.moveTo(W * (0.26 - w * 0.03), H);
        ctx.bezierCurveTo(W * 0.42, H * (0.74 - w * 0.03), W * 0.72, H * (0.66 - w * 0.03), W, H * (0.60 - w * 0.02));
        ctx.stroke();
      }

      // Dramatic sea cliffs & lighthouse silhouette on left headland
      ctx.fillStyle = '#14213d';
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.28);
      ctx.lineTo(W * 0.28, H * 0.36);
      ctx.lineTo(W * 0.34, H * 0.56);
      ctx.lineTo(0, H * 0.58);
      ctx.closePath();
      ctx.fill();

      // Lighthouse on headland
      ctx.fillStyle = '#e5e5e5';
      ctx.fillRect(W * 0.22, H * 0.24, 18, 85);
      brushDab(W * 0.22 + 9, H * 0.23, 45, 22, 0, '#ffbe0b', 0.6);
      brushDab(W * 0.22 + 9, H * 0.23, 8, 8, 0, '#ffffff', 0.95);

    } else if (locId === 'cave_dungeon') {
      // Subterranean dark stone wash
      painterlyWash(0, 0, 0, H, pal.skyTop, pal.ground1);

      // Cavern receding arch rings
      for (let r = 0; r < 3; r++) {
        ctx.strokeStyle = r === 0 ? '#0b0f1c' : '#161f36';
        ctx.lineWidth = 75;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.58, W * (0.46 - r * 0.11), Math.PI, 0);
        ctx.stroke();
      }

      //Hanging stalactites from roof
      ctx.fillStyle = '#090d18';
      for (let sx = 40; sx < W - 40; sx += randRange(45, 95)) {
        const sh = randRange(70, 220);
        const sw = randRange(22, 50);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + sw / 2, sh);
        ctx.lineTo(sx + sw, 0);
        ctx.closePath();
        ctx.fill();
      }

      // Glowing bioluminescent crystal clusters (cyan & violet)
      const crystalSpots = [
        { x: W * 0.22, y: H * 0.68, col: '#00f5d4' },
        { x: W * 0.78, y: H * 0.64, col: '#00bbf9' },
        { x: W * 0.35, y: H * 0.48, col: '#9b5de5' }
      ];
      for (let cs of crystalSpots) {
        brushDab(cs.x, cs.y, 120, 90, 0, cs.col, 0.24);
        for (let k = -2; k <= 2; k++) {
          ctx.fillStyle = cs.col;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.moveTo(cs.x + k * 14, cs.y + 20);
          ctx.lineTo(cs.x + k * 18, cs.y - 38 - Math.abs(k) * 8);
          ctx.lineTo(cs.x + k * 14 + 12, cs.y + 20);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Ancient carved dungeon archway & flickering wall torch in center-right
      ctx.fillStyle = '#1e2738';
      ctx.globalAlpha = 0.95;
      ctx.fillRect(W * 0.42, H * 0.34, 24, 240);
      ctx.fillRect(W * 0.56, H * 0.34, 24, 240);
      ctx.fillRect(W * 0.41, H * 0.32, W * 0.18, 26);

      // Wall torch flame
      brushDab(W * 0.59, H * 0.45, 95, 95, 0, '#ff9e00', 0.38);
      brushDab(W * 0.59, H * 0.45, 14, 24, 0, '#ffea00', 0.95);

    } else if (locId === 'ruins_temple') {
      // Misty overgrown temple sky
      painterlyWash(0, 0, 0, H * 0.65, pal.skyTop, pal.skyLow);

      // Sacred shaft of sunlight hitting central altar
      ctx.save();
      const ray = ctx.createLinearGradient(W * 0.35, 0, W * 0.52, H);
      ray.addColorStop(0, 'rgba(254, 240, 138, 0.32)');
      ray.addColorStop(1, 'rgba(254, 240, 138, 0.02)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(W * 0.32, 0);
      ctx.lineTo(W * 0.52, 0);
      ctx.lineTo(W * 0.68, H);
      ctx.lineTo(W * 0.36, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Moss-covered temple steps and stone courtyard
      ctx.fillStyle = '#22332c';
      ctx.fillRect(0, H * 0.62, W, H * 0.38);
      for (let st = 0; st < 4; st++) {
        ctx.fillStyle = st % 2 === 0 ? '#4a5750' : '#37423c';
        ctx.fillRect(W * (0.28 - st * 0.03), H * (0.58 + st * 0.05), W * (0.44 + st * 0.06), 24);
      }

      // Ancient fluted stone columns (some intact, some broken)
      const cols = [
        { x: W * 0.16, h: 420 },
        { x: W * 0.28, h: 290 },
        { x: W * 0.70, h: 390 },
        { x: W * 0.82, h: 220 }
      ];
      for (let c of cols) {
        ctx.fillStyle = '#6b705c';
        ctx.fillRect(c.x, H * 0.64 - c.h, 52, c.h);
        // Column base
        ctx.fillStyle = '#4a4e40';
        ctx.fillRect(c.x - 10, H * 0.64 - 22, 72, 22);
        // Hanging ivy & moss dabs
        for (let v = 0; v < 8; v++) {
          brushDab(c.x + randRange(5, 48), H * 0.64 - c.h + v * 28, 22, 14, 0.2, '#3a5a40', 0.85);
        }
      }

      // Carved stone altar at top of steps
      ctx.fillStyle = '#8b8c7a';
      ctx.fillRect(W * 0.44, H * 0.50, W * 0.12, 55);
      brushDab(W * 0.50, H * 0.48, 35, 35, 0, '#fca311', 0.5);

    } else if (locId === 'desert_wasteland') {
      // Scorching amber & crimson sunset sky
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.56);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(0.5, pal.skyMid);
      sky.addColorStop(1, pal.skyLow);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.56);

      // Giant blazing desert sun
      brushDab(W * 0.72, H * 0.34, 140, 140, 0, '#f4a261', 0.4);
      brushDab(W * 0.72, H * 0.34, 65, 65, 0, '#ffe8a3', 0.92);

      // Flat-topped sandstone mesas and canyon buttes on horizon
      const mesas = [
        { x: W * 0.08, w: 260, h: 190 },
        { x: W * 0.42, w: 190, h: 240 },
        { x: W * 0.78, w: 220, h: 160 }
      ];
      for (let m of mesas) {
        ctx.fillStyle = '#5c200e';
        ctx.beginPath();
        ctx.moveTo(m.x - 45, H * 0.56);
        ctx.lineTo(m.x, H * 0.56 - m.h);
        ctx.lineTo(m.x + m.w, H * 0.56 - m.h);
        ctx.lineTo(m.x + m.w + 50, H * 0.56);
        ctx.closePath();
        ctx.fill();
      }

      // Sweeping golden-red sand dunes in foreground
      const dune1 = ctx.createLinearGradient(0, H * 0.52, 0, H);
      dune1.addColorStop(0, '#c86d51');
      dune1.addColorStop(1, '#6f2912');
      ctx.fillStyle = dune1;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.56);
      ctx.bezierCurveTo(W * 0.35, H * 0.46, W * 0.65, H * 0.64, W, H * 0.52);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      const dune2 = ctx.createLinearGradient(0, H * 0.65, W, H);
      dune2.addColorStop(0, '#e9c46a');
      dune2.addColorStop(1, '#9c3d1a');
      ctx.fillStyle = dune2;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.74);
      ctx.bezierCurveTo(W * 0.42, H * 0.62, W * 0.75, H * 0.80, W, H * 0.68);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

    } else if (locId === 'campsite') {
      // Starry indigo twilight sky
      painterlyWash(0, 0, 0, H * 0.62, pal.skyTop, pal.skyLow);

      // Stars in night sky
      for (let s = 0; s < 90; s++) {
        brushDab(randRange(0, W), randRange(10, H * 0.45), randRange(1, 2.8), randRange(1, 2.8), 0, '#ffffff', randRange(0.4, 0.95));
      }

      // Silhouette of pine trees around clearing
      ctx.fillStyle = '#070d19';
      for (let px = 0; px < W; px += 42) {
        if (px > W * 0.32 && px < W * 0.68) continue;
        const ph = randRange(180, 320);
        ctx.beginPath();
        ctx.moveTo(px - 28, H * 0.62);
        ctx.lineTo(px, H * 0.62 - ph);
        ctx.lineTo(px + 28, H * 0.62);
        ctx.closePath();
        ctx.fill();
      }

      // Forest clearing ground
      ctx.fillStyle = '#0a111f';
      ctx.fillRect(0, H * 0.60, W, H * 0.40);

      // Warm illuminated canvas A-frame tent on left
      const tx = W * 0.20;
      const ty = H * 0.42;
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(tx, ty + 180);
      ctx.lineTo(tx + 120, ty);
      ctx.lineTo(tx + 240, ty + 180);
      ctx.closePath();
      ctx.fill();
      // Inner tent lantern glow
      brushDab(tx + 120, ty + 110, 95, 75, 0, '#fde047', 0.45);

      // Central crackling campfire & log ring
      const fx = W * 0.56;
      const fy = H * 0.74;
      brushDab(fx, fy - 20, 260, 180, 0, '#ff7b00', 0.32);
      for (let fl = 0; fl < 28; fl++) {
        brushDab(fx + randRange(-28, 28), fy - randRange(5, 75), randRange(12, 28), randRange(22, 55), randRange(-0.2, 0.2), '#ff8800', 0.75);
        brushDab(fx + randRange(-14, 14), fy - randRange(5, 55), randRange(8, 18), randRange(15, 36), 0, '#fff3b0', 0.9);
      }
      // Rising glowing embers
      for (let e = 0; e < 24; e++) {
        brushDab(fx + randRange(-45, 45), fy - 90 - randRange(0, 180), randRange(2, 4), randRange(2, 4), 0, '#ffb703', 0.85);
      }

    } else if (locId === 'library_study') {
      // Rich mahogany library interior wash
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Towering floor-to-ceiling bookshelves on left & right walls
      for (let side of [0, W * 0.64]) {
        const sw = W * 0.36;
        ctx.fillStyle = '#1b0f0a';
        ctx.fillRect(side, 20, sw, H * 0.76);
        for (let sy = 75; sy < H * 0.74; sy += 62) {
          ctx.fillStyle = '#331d14';
          ctx.fillRect(side, sy, sw, 10);
          for (let bx = side + 12; bx < side + sw - 18; bx += randRange(9, 17)) {
            ctx.fillStyle = rand() > 0.6 ? '#991b1b' : (rand() > 0.5 ? '#1e3a8a' : (rand() > 0.5 ? '#14532d' : '#92400e'));
            const bh = randRange(36, 48);
            ctx.fillRect(bx, sy - bh, randRange(7, 13), bh);
          }
        }
      }

      // Arched gothic study window in center background
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.28, 95, Math.PI, 0);
      ctx.lineTo(W * 0.5 + 95, H * 0.58);
      ctx.lineTo(W * 0.5 - 95, H * 0.58);
      ctx.closePath();
      ctx.fill();

      // Heavy scholar's mahogany desk in foreground
      ctx.fillStyle = '#2d1810';
      ctx.fillRect(W * 0.24, H * 0.64, W * 0.52, 35);
      ctx.fillStyle = '#1f100a';
      ctx.fillRect(W * 0.26, H * 0.64 + 35, W * 0.48, H * 0.32);

      // Green banker's / brass reading lamp & open tome on desk
      brushDab(W * 0.38, H * 0.56, 130, 110, 0, '#ffb703', 0.38);
      brushDab(W * 0.38, H * 0.54, 28, 16, 0, '#2a9d8f', 0.95);
      brushDab(W * 0.38, H * 0.56, 16, 10, 0, '#fef08a', 0.95);

      // Open parchment tome
      ctx.fillStyle = '#f5ebe0';
      ctx.fillRect(W * 0.48, H * 0.61, 85, 22);

    } else if (locId === 'cafe_diner') {
      // Warm cozy coffeehouse / diner interior wash
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Rainy street window on left with neon reflection
      ctx.fillStyle = '#111927';
      ctx.fillRect(50, 70, W * 0.42, H * 0.52);
      brushDab(180, 190, 90, 50, 0, '#e71d36', 0.42);
      brushDab(340, 230, 80, 45, 0, '#2ec4b6', 0.38);
      ctx.strokeStyle = '#2b1d19';
      ctx.lineWidth = 8;
      ctx.strokeRect(50, 70, W * 0.42, H * 0.52);

      // Espresso bar counter on right
      ctx.fillStyle = '#3d251e';
      ctx.fillRect(W * 0.54, H * 0.48, W * 0.42, 34);
      ctx.fillStyle = '#241511';
      ctx.fillRect(W * 0.54, H * 0.48 + 34, W * 0.42, H * 0.45);

      // Warm hanging pendant lights over counter and booth
      for (let lx of [W * 0.25, W * 0.64, W * 0.82]) {
        ctx.strokeStyle = '#140d0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, 130);
        ctx.stroke();
        brushDab(lx, 145, 110, 95, 0, '#ff9f1c', 0.35);
        brushDab(lx, 140, 22, 14, 0, '#fff3b0', 0.95);
      }

      // Red leather diner booth & table in foreground left
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(40, H * 0.64, 180, H * 0.36);
      ctx.fillRect(380, H * 0.64, 180, H * 0.36);
      ctx.fillStyle = '#d6d3d1';
      ctx.fillRect(160, H * 0.72, 260, 24);

      // Steaming white coffee mug on table
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(275, H * 0.67, 26, 32);
      brushDab(288, H * 0.63, 12, 22, 0, '#ffffff', 0.28);

    } else if (locId === 'office_lab') {
      // Sleek high-tech research laboratory / corporate interior
      painterlyWash(0, 0, 0, H, pal.wallTop, pal.ground1);

      // Reflective sterile floor grid
      const labFloor = ctx.createLinearGradient(0, H * 0.62, 0, H);
      labFloor.addColorStop(0, '#0f1c2e');
      labFloor.addColorStop(1, '#060b13');
      ctx.fillStyle = labFloor;
      ctx.fillRect(0, H * 0.62, W, H * 0.38);

      // Illuminated cyan holographic display walls & containment cylinder
      const holoPanels = [
        { x: W * 0.10, y: 110, w: 280, h: 190, col: '#00bbf9' },
        { x: W * 0.64, y: 110, w: 310, h: 210, col: '#00f5d4' }
      ];
      for (let p of holoPanels) {
        brushDab(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.7, p.h * 0.7, 0, p.col, 0.22);
        ctx.fillStyle = 'rgba(0, 187, 249, 0.18)';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        // Data waveform lines
        for (let ly = p.y + 30; ly < p.y + p.h - 20; ly += 28) {
          ctx.beginPath();
          ctx.moveTo(p.x + 20, ly);
          ctx.lineTo(p.x + p.w - randRange(30, 110), ly);
          ctx.stroke();
        }
      }

      // Central glowing specimen / holographic core column
      const cx = W * 0.43;
      const cw = W * 0.14;
      const cylGrad = ctx.createLinearGradient(cx, 60, cx + cw, 60);
      cylGrad.addColorStop(0, 'rgba(0, 245, 212, 0.15)');
      cylGrad.addColorStop(0.5, 'rgba(0, 245, 212, 0.55)');
      cylGrad.addColorStop(1, 'rgba(0, 245, 212, 0.15)');
      ctx.fillStyle = cylGrad;
      ctx.fillRect(cx, 70, cw, H * 0.56);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx - 16, 50, cw + 32, 28);
      ctx.fillRect(cx - 16, H * 0.62, cw + 32, 32);

    } else if (locId === 'street_market') {
      // Dusk market street sky between buildings
      painterlyWash(0, 0, 0, H, pal.skyTop, pal.ground1);

      // Tall narrow merchant buildings flanking left & right
      ctx.fillStyle = '#161124';
      ctx.fillRect(0, 0, W * 0.28, H * 0.78);
      ctx.fillRect(W * 0.72, 0, W * 0.28, H * 0.78);

      // Cobblestone market street in perspective
      ctx.fillStyle = '#1b162a';
      ctx.beginPath();
      ctx.moveTo(W * 0.36, H * 0.52);
      ctx.lineTo(W * 0.64, H * 0.52);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // Colorful fabric market awnings on left & right stalls
      const awnings = [
        { x: W * 0.08, y: H * 0.42, w: 240, col: '#e11d48' },
        { x: W * 0.18, y: H * 0.48, w: 190, col: '#d97706' },
        { x: W * 0.64, y: H * 0.44, w: 230, col: '#0284c7' },
        { x: W * 0.58, y: H * 0.50, w: 180, col: '#7c3aed' }
      ];
      for (let a of awnings) {
        ctx.fillStyle = a.col;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + a.w, a.y + 28);
        ctx.lineTo(a.x + a.w - 20, a.y + 72);
        ctx.lineTo(a.x - 10, a.y + 48);
        ctx.closePath();
        ctx.fill();
      }

      // Strings of glowing warm lanterns strung across the alleyway
      for (let row = 0; row < 3; row++) {
        const ly = 130 + row * 85;
        ctx.strokeStyle = '#090612';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W * 0.22, ly);
        ctx.quadraticCurveTo(W * 0.50, ly + 45, W * 0.78, ly);
        ctx.stroke();

        for (let t = 0.15; t <= 0.85; t += 0.14) {
          const lx = W * 0.22 * (1 - t) + W * 0.78 * t;
          const lpy = ly + Math.sin(t * Math.PI) * 32;
          brushDab(lx, lpy + 10, 42, 42, 0, '#ff9e00', 0.38);
          brushDab(lx, lpy + 10, 10, 14, 0, '#fef08a', 0.95);
        }
      }

    } else if (locId === 'space_station') {
      // Deep space cosmos background
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, W, H);

      // Stars & distant magenta/cyan nebula outside viewport
      for (let s = 0; s < 140; s++) {
        brushDab(randRange(W * 0.15, W * 0.85), randRange(40, H * 0.62), randRange(1, 2.5), randRange(1, 2.5), 0, '#ffffff', randRange(0.4, 0.95));
      }
      brushDab(W * 0.65, H * 0.26, 220, 90, -0.25, '#7209b7', 0.28);
      brushDab(W * 0.62, H * 0.28, 160, 65, -0.25, '#4cc9f0', 0.24);

      // Glowing planet horizon curved in the panoramic viewport
      const planetGrad = ctx.createRadialGradient(W * 0.38, H * 0.95, 80, W * 0.38, H * 0.95, 520);
      planetGrad.addColorStop(0, '#4cc9f0');
      planetGrad.addColorStop(0.55, '#1d3557');
      planetGrad.addColorStop(0.72, '#00f5d4');
      planetGrad.addColorStop(0.76, 'rgba(0, 245, 212, 0.25)');
      planetGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = planetGrad;
      ctx.beginPath();
      ctx.arc(W * 0.38, H * 0.95, 520, Math.PI, 0);
      ctx.fill();

      // Metallic curved station hull bulkheads & ceiling ribs
      ctx.fillStyle = '#0b101e';
      ctx.fillRect(0, 0, W, 85);
      ctx.fillRect(0, H * 0.62, W, H * 0.38);
      ctx.fillRect(0, 0, 120, H);
      ctx.fillRect(W - 120, 0, 120, H);

      // Angled viewport structural struts
      ctx.strokeStyle = '#162038';
      ctx.lineWidth = 26;
      for (let sx of [W * 0.32, W * 0.68]) {
        ctx.beginPath();
        ctx.moveTo(sx, 75);
        ctx.lineTo(sx + (sx < W * 0.5 ? -50 : 50), H * 0.64);
        ctx.stroke();
      }

      // Illuminated command consoles & telemetry strips in foreground
      for (let cx of [W * 0.22, W * 0.50, W * 0.78]) {
        ctx.fillStyle = '#141d33';
        ctx.fillRect(cx - 95, H * 0.68, 190, 95);
        brushDab(cx, H * 0.70, 90, 45, 0, '#00f5d4', 0.32);
        ctx.fillStyle = '#00f5d4';
        ctx.fillRect(cx - 70, H * 0.70, 140, 26);
      }
    }

    // Apply overall artistic textures & vignette
    addCanvasTexture();
    drawVignette(0.42);
  })();
  `;
}

(async () => {
  console.log('=============================================================');
  console.log(' EllipsisLM Default Location Painterly Image Generator');
  console.log('=============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  for (const loc of LOCATIONS) {
    const targetFile = path.join(outDir, loc.filename);
    console.log(`Generating [${loc.title}] -> ${loc.filename}...`);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 1280px; height: 720px; overflow: hidden; background: #000; }
          canvas { width: 1280px; height: 720px; display: block; }
        </style>
      </head>
      <body>
        <canvas id="paintCanvas" width="1280" height="720"></canvas>
        <script>
          ${generateSceneScript(loc)}
        </script>
      </body>
      </html>
    `;

    await page.setContent(html);
    // Allow canvas rendering to execute cleanly
    await page.waitForTimeout(100);

    await page.screenshot({
      path: targetFile,
      type: 'jpeg',
      quality: 92
    });

    const stats = fs.statSync(targetFile);
    console.log(`  ✓ Created: ${loc.filename} (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  await browser.close();
  console.log(`\nAll ${LOCATIONS.length} default location painterly images generated successfully in:`);
  console.log(outDir);
  console.log('=============================================================\n');
})().catch(err => {
  console.error('Generation error:', err);
  process.exit(1);
});
