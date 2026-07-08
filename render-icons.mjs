// render-icons.mjs — Pro Roto PWA icon generator
// Uses the Playwright Chromium already installed for e2e tests.
// Usage:
//   node render-icons.mjs preview          → writes preview-A.png / preview-B.png (open & pick)
//   VARIANT=A node render-icons.mjs finalize   (or VARIANT=B)
import { chromium } from '@playwright/test';
import fs from 'fs';

const LOGO_B64 = 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAyNC4yLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDApICAtLT4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiDQoJIHZpZXdCb3g9IjAgMCA1MjQgMzAwIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCA1MjQgMzAwOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8c3R5bGUgdHlwZT0idGV4dC9jc3MiPg0KCS5zdDB7ZmlsbDpub25lO3N0cm9rZTojMDAwMEZGO3N0cm9rZS13aWR0aDoyO3N0cm9rZS1taXRlcmxpbWl0OjEwO30NCgkuc3Qxe2ZpbGw6IzAwMDBGRjtzdHJva2U6IzAwMDBGRjtzdHJva2Utd2lkdGg6MC41O3N0cm9rZS1taXRlcmxpbWl0OjEwO30NCgkuc3Qye2ZpbGwtcnVsZTpldmVub2RkO2NsaXAtcnVsZTpldmVub2RkO2ZpbGw6IzAwMDBGRjt9DQoJLnN0M3tmaWxsLXJ1bGU6ZXZlbm9kZDtjbGlwLXJ1bGU6ZXZlbm9kZDtmaWxsOiNGRjAwMDA7fQ0KPC9zdHlsZT4NCjxnPg0KCTxjaXJjbGUgY2xhc3M9InN0MCIgY3g9IjQ1OC4yIiBjeT0iMjE2LjEiIHI9IjkuNiIvPg0KCTxnPg0KCQk8cGF0aCBjbGFzcz0ic3QxIiBkPSJNNDU1LjIsMjExLjNjMC43LTAuMSwxLjYtMC4yLDIuNS0wLjJjMS40LDAsMi4zLDAuMywyLjksMC44YzAuNSwwLjQsMC44LDEuMSwwLjgsMS45YzAsMS4zLTAuOSwyLjItMS45LDIuNg0KCQkJdjAuMWMwLjgsMC4zLDEuMywxLDEuNSwyLjFjMC4zLDEuNCwwLjYsMi40LDAuOCwyLjhoLTEuNGMtMC4yLTAuMy0wLjQtMS4yLTAuNy0yLjRjLTAuMy0xLjQtMC45LTEuOS0yLTJoLTEuMnY0LjRoLTEuMw0KCQkJTDQ1NS4yLDIxMS4zTDQ1NS4yLDIxMS4zeiBNNDU2LjYsMjE1LjloMS4zYzEuNCwwLDIuMy0wLjgsMi4zLTEuOWMwLTEuMy0xLTEuOS0yLjMtMS45Yy0wLjYsMC0xLjEsMC4xLTEuMywwLjFWMjE1Ljl6Ii8+DQoJPC9nPg0KCTxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0xNTguNCwyMTJjLTUuNiwxMi41LTE3LjgsMjEuOS0zOC4xLDIwLjZjLTExLjYtMC43LTE5LjEtNS45LTI1LjItMTIuNmMtNS42LTYuNS05LjctMTQuNC0xMC4yLTI1LjkNCgkJYy0wLjMtMS41LTAuMy00LjQsMC01LjljMC44LTE5LjMsMTItMzEuMSwxOS44LTQ0LjJjNy4zLTEyLjEsMTMuMi0yNC4yLDE2LjUtNDBsMi03LjVsMCwwbDEuOSw4YzMuNSwxOS41LDEyLjUsMzQuOCwyMS44LDQ5LjINCgkJYzMuNCw1LjIsNy40LDEwLjMsOS44LDE1LjdDMTYyLjIsMTgxLjEsMTY0LDE5OS42LDE1OC40LDIxMiIvPg0KCTxnPg0KCQk8cGF0aCBjbGFzcz0ic3QyIiBkPSJNMTM1LjUsNzYuN2MxNS4zLTExLDMxLjktMjAuMiw0OS41LTI3LjNjMjAuOC04LjQsNDMuNC0xNC44LDY5LjktMTcuNGMzOC41LTMuNyw3NC4xLDAuMiwxMDkuOCwxNC4zDQoJCQljMTcuMSw2LjgsMzIuNywxNS4xLDQ3LjEsMjQuNmMzNy44LDI1LDcwLjIsNTkuMyw5MS42LDk5YzYuNiwxMi4zLDEyLjYsMjUuOSwxNy42LDM5LjljLTItOC45LTQuNC0xNy40LTcuMS0yNS42DQoJCQlDNDkwLDExMiw0MzYuNiw1My44LDM2Ni43LDIzLjRDMzQzLDEzLDMxNi4yLDUuNywyODQuOSwyLjljLTE5LjQtMS43LTI4LjctMS43LTQ4LjItMC4yYy0zOC4yLDIuOS02OS43LDEyLjUtOTcuMywyNi4xDQoJCQljLTM1LjksMTcuNy02Ny45LDQyLjMtOTIuNSw3NC4zYy03LjMsOS40LTE0LjMsMTkuOC0yMC42LDMwLjljLTE5LjYsMzQuNi0zNi44LDgzLjMtMTEsMTIwLjJjMTYuOSwyNC4xLDQ4LjUsMzcsODEuOSw0MS43DQoJCQljMTAuMiwxLjQsMjEuNSwyLDMyLjQsMi41YzEyLjcsMC42LDI1LjcsMCwzOC43LDBoMjcyLjV2LTU3LjhIMTYyLjdjLTEzLjQsMC0yNi45LDAuNi0zOS45LDBjLTI4LjQtMS4zLTU1LjMtNi45LTY1LjYtMjcuMQ0KCQkJYy0xNi0zMS4yLDE4LjMtNzcuOCwzNy41LTEwMGMxMC40LTEyLDI0LTIzLjgsMzItMzAuM0wxMzUuNSw3Ni43Ii8+DQoJPC9nPg0KCTxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0yOTQsMjI2LjNDMjkzLjksMjI2LjMsMjkzLjksMjI2LjMsMjk0LDIyNi4zYy0xNi4yLDAuOS0zNC44LTEuNi0zMC40LTIzLjVjNC0xOS40LDE4LjgtMzEuNiwzOS44LTMzLjQNCgkJYzUuMS0wLjQsMTAuMi0wLjIsMTQuNSwxLjFjMTEuMywzLjQsMTIuOCwxMy4yLDExLjgsMjMuN0MzMjcuNCwyMTYuNiwzMTYuMSwyMjUuMiwyOTQsMjI2LjMgTTMwMS4zLDE4Mi44YzAsMC0wLjEsMC0wLjEsMA0KCQljLTYuMSwwLjUtMTIsNy40LTEzLDEzLjhjLTEsNS42LDEuMiw5LjMsNy4zLDkuMmM2LjMtMC4xLDEwLjctNS4zLDEyLjItMTEuNkMzMTAuMSwxODMuMSwzMDMuMSwxODIuNywzMDEuMywxODIuOHogTTQwNy4xLDIyNi4zDQoJCUM0MDcuMSwyMjYuMyw0MDcuMSwyMjYuMyw0MDcuMSwyMjYuM2MtMTYuMiwwLjktMzQuOC0xLjYtMzAuNC0yMy41YzQtMTkuNCwxOC44LTMxLjYsMzkuOC0zMy40YzUuMS0wLjQsMTAuMi0wLjIsMTQuNSwxLjENCgkJYzExLjMsMy40LDEyLjgsMTMuMiwxMS44LDIzLjdDNDQwLjYsMjE2LjYsNDI5LjMsMjI1LjIsNDA3LjEsMjI2LjN6IE00MTQuNCwxODIuOGMwLDAtMC4xLDAtMC4xLDBjLTYuMSwwLjUtMTEuOSw3LjQtMTMsMTMuOA0KCQljLTEsNS42LDEuMiw5LjMsNy4zLDkuMmM2LjMtMC4xLDEwLjctNS4zLDEyLjItMTEuNkM0MjMuMiwxODMuMSw0MTYuMywxODIuNyw0MTQuNCwxODIuOHogTTIxNSwxODguMWM5LjEtMC44LDE2LjEtNC45LDE1LjgtMTQNCgkJYzAuMi01LjctNy41LTQuNC0xMi4zLTMuNmMtNS40LDEtNi4yLDEuMy03LjIsNi45Yy0wLjMsMS45LTAuNiw0LTEsNi4xQzIwOS4xLDE4OC40LDIxMC43LDE4OC41LDIxNSwxODguMXogTTM3Ni43LDE4NC45DQoJCWMtMi4zLDEuNy02LjUsMC43LTkuNCwyLjJjLTIsNS4yLTMuMSwxMS4xLTQuMywxNy4xYzEuNCwwLjMsMy41LTAuMyw1LTAuMWMxLjksMC4zLDMuNywyLjUsMy42LDQuMWMtMC4yLDIuNS0wLjYsNC41LTEuMyw2LjkNCgkJYy0xLjQsNC45LTIuMSw5LjYtNi43LDEwYy0zLjMsMC40LTYuOCwwLTEwLDBjLTMuNCwwLTYuOCwwLjMtMTAsMGMtNC45LTAuNC05LjgtMy43LTEwLjQtNy45Yy0wLjYtMy44LDEuMy04LjksMy0xMi42DQoJCWMyLjEtNS42LDQuNC0xMSw2LjMtMTYuN2MtMS4zLDAuMS0yLjksMC40LTQuMSwwLjNjLTMuNC0wLjItMy43LTMuNS0zLjctMy40YzAuNC0zLjEsMS45LTcsMy4zLTguN2MyLjItMi42LDcuMy0xLjUsMTAtMy41DQoJCWMyLjUtNi41LDQuMy0xMCwxMi0xMWMxLjQtMC4yLDQtMC43LDYtMC42YzIuNi0wLjMsNS4zLDIuNiw1LjQsNGMwLjEsMS45LTEuMyw0LjctMSw2YzAsMC4yLDAuMywwLjIsMC42LDAuMg0KCQljMS40LDAuMSwzLjItMC41LDQuNy0wLjZjNS40LDAsNC43LDMuNCw0LjUsNC43QzM3OS4yLDE3OC45LDM3OC4zLDE4My43LDM3Ni43LDE4NC45eiBNMjI4LjcsMjI1LjJjLTAuMywwLTAuNSwwLTQuNy0wLjQNCgkJYy0wLjEsMC0wLjEsMC0wLjEsMGMtMTEuNS0yMy0xMS43LTIzLjMtMTEuOC0yMy42Yy0wLjEsMC0wLjMsMC4yLTAuNSwwLjdsLTQuNCwxNi44Yy0wLjksMy4zLTIuMSw2LjEtNC4yLDYuNQ0KCQljLTAuNSwwLjEtMC45LDAuMS0xLjQsMC4ybC0yMy42LDBjLTAuOC0wLjEtMy42LTAuMS02LjMtMC45Yy0wLjYtMC4yLDcuOS0yMiwyMS4zLTUyLjVjMi4xLTUuMiwyLjUtOC43LDktOS40DQoJCWMxLjctMC4yLDMuNS0wLjQsNS40LTAuNmMyLjYtMC4zLDE1LjktMS4yLDIzLjYtMS44YzQuNy0wLjMsOS44LTAuOCwxNC4zLDEuMWM1LjQsMi4zLDkuNCw3LjYsMTAuNCwxMy40YzAuMSwwLjUsMC4xLDEuMSwwLjIsMS42DQoJCWMwLjksMTIuMS03LDE3LjEtMTUuNywxOS45YzAsMC4yLTAuMSwwLjMtMC4xLDAuNGMwLDAuMSwxOS4yLDI3LjcsMTkuMiwyNy43Yy0wLjUsMC40LTAuNiwwLjctMS4yLDAuOUwyMjguNywyMjUuMnoiLz4NCgk8cGF0aCBjbGFzcz0ic3QzIiBkPSJNMzI4LjUsMTU1QzMyOC40LDE1NSwzMjguNCwxNTUsMzI4LjUsMTU1Yy0xNywwLjktMzYuNS0xLjctMzEuOC0yNC42YzQuMi0yMC40LDE5LjctMzMuMSw0MS44LTM1LjENCgkJYzUuNC0wLjUsMTAuNy0wLjIsMTUuMiwxLjFjMTEuOSwzLjYsMTMuNSwxMy45LDEyLjQsMjQuOUMzNjMuNiwxNDQuOCwzNTEuNywxNTMuOCwzMjguNSwxNTUgTTMzNi4xLDEwOS4zYzAsMC0wLjEsMC0wLjEsMA0KCQljLTYuNCwwLjYtMTIuNSw3LjgtMTMuNywxNC40Yy0xLDUuOSwxLjMsOS43LDcuNyw5LjdjNi42LTAuMSwxMS4yLTUuNSwxMi44LTEyLjJDMzQ1LjQsMTA5LjYsMzM4LjEsMTA5LjIsMzM2LjEsMTA5LjN6DQoJCSBNMjAxLjIsMTE2LjNjMTEuMi0wLjEsMjAuMS00LjUsMTguNy0xNS45YzAtMC42LTAuNi0wLjYtMC44LTFjLTEuNS0yLjEtNS43LTEuNC0xMC0xYy0yLjksMC4zLTYuNCwxLjMtNS43LDEuNg0KCQljLTAuOC0wLjMtMC42LDAuNC0xLjIsMC40Yy0wLjEsMC42LTAuMiwxLjItMC40LDEuN2wtMi44LDExLjRjMCwxLjIsMC4yLDIuNCwxLjMsMi43QzIwMC44LDExNi4xLDIwMSwxMTYuMiwyMDEuMiwxMTYuM3oNCgkJIE0yOTYuNiwxMDcuNGMtMC40LDIuNC0wLjcsNi4yLTIsNy4xYy0yLjMsMS41LTYuMy0wLjgtOS44LTAuNGMtNy45LDAuOC04LjUsMTAuMy05LjQsMTguN2MtMC40LDMuNS0wLjgsNy4yLTEuMiwxMS4yDQoJCWMtMC40LDMuNi0wLjUsOC44LTIuNCw5LjhjLTIuMywxLjMtOS44LDAuNC0xMy44LDAuNGMtNi4xLDAtMTQuMiwxLjMtMTUuNS0yLjRjLTMuMi0xLTEuNC00LjktMC4yLTguNA0KCQljMy40LTEwLjEsNy4xLTIwLjgsMTAuNi0zMS4xYzEuMy0zLjcsMi43LTEwLjUsNS4zLTEyLjRjMy4yLTIuMywxNi4xLTQuNCwxNy43LDAuM2MwLjgsMS41LDAuNSw0LDEuNSw1LjRjMi4zLTMuNSw2LjUtOS4zLDEyLjQtMTANCgkJYzMuNi0wLjQsNy45LDAuNSw4LDQuOUMyOTcuOCwxMDIuNywyOTYuOSwxMDUuNCwyOTYuNiwxMDcuNHogTTIzOS4xLDEyMC45Yy03LjQsOC41LTIwLjIsOS40LTM0LjIsMTEuMmMtMS42LDAuMi00LjQsMC4xLTUuNSwwLjgNCgkJYy0xLjgsMS4yLTIuMiw3LjktMi44LDEwLjZjLTAuNywzLjQtMS4zLDkuMS0zLjEsMTAuMmMtMi4xLDEuMy0xMC45LDAuNC0xNC4xLDAuNGgtNy4zYy0zLjYsMC03LjUsMC42LTguMy0yLjQNCgkJYy0zLjMtMS45LTAuMi02LjgsMS0xMC4yYzQuOS0xNC4xLDEwLjItMjguNCwxNS4xLTQyLjdjMS4zLTMuOCwyLjEtOS4zLDYuMS0xMC40YzIuNS0wLjcsNS42LTAuNyw4LjQtMS4yDQoJCWM4LjQtMS40LDE3LjMtMy4xLDI2LjItMy45YzkuOC0wLjksMjIuMSwyLjcsMjQuNCwxNC4yQzI0Ni43LDEwNS43LDI0My4xLDExNi40LDIzOS4xLDEyMC45eiIvPg0KPC9nPg0KPC9zdmc+DQo=';
const DROP_D = `M158.4,212c-5.6,12.5-17.8,21.9-38.1,20.6c-11.6-0.7-19.1-5.9-25.2-12.6c-5.6-6.5-9.7-14.4-10.2-25.9 c-0.3-1.5-0.3-4.4,0-5.9c0.8-19.3,12-31.1,19.8-44.2c7.3-12.1,13.2-24.2,16.5-40l2-7.5l0,0l1.9,8c3.5,19.5,12.5,34.8,21.8,49.2 c3.4,5.2,7.4,10.3,9.8,15.7C162.2,181.1,164,199.6,158.4,212`;
const BLUE = '#2563eb';

// Variant A: white water-drop emblem on brand-blue rounded square
function svgA(size, maskable = false) {
  const r = maskable ? 0 : Math.round(size / 6);
  const pad = maskable ? 0.24 : 0.16;             // maskable needs bigger safe zone
  // Drop bounds in source coords: x≈84–166, y≈96–234
  const bw = 82, bh = 138, bx = 84, by = 96;
  const s = (size * (1 - 2 * pad)) / bh;          // fit by height
  const tx = (size - bw * s) / 2 - bx * s;
  const ty = (size - bh * s) / 2 - by * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="${BLUE}"/>
    <g transform="translate(${tx},${ty}) scale(${s})"><path d="${DROP_D}" fill="white"/></g>
  </svg>`;
}

// Variant B: full logo letterboxed on white rounded square
function svgB(size, maskable = false) {
  const r = maskable ? 0 : Math.round(size / 6);
  const pad = maskable ? 0.20 : 0.10;
  const w = size * (1 - 2 * pad);
  const h = w * (300 / 524);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="white"/>
    <image href="data:image/svg+xml;base64,${LOGO_B64}"
           x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}"/>
  </svg>`;
}

async function shoot(page, svg, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: out, omitBackground: true });
  console.log('wrote', out);
}

const mode = process.argv[2] ?? 'preview';
const browser = await chromium.launch();
const page = await browser.newPage();

if (mode === 'preview') {
  await shoot(page, svgA(512), 512, 'preview-A.png');
  await shoot(page, svgB(512), 512, 'preview-B.png');
  console.log('\nOpen preview-A.png and preview-B.png in the file explorer, pick one,');
  console.log('then run:  VARIANT=A node render-icons.mjs finalize   (or VARIANT=B)');
} else {
  const V = (process.env.VARIANT ?? 'A').toUpperCase();
  const gen = V === 'B' ? svgB : svgA;
  await shoot(page, gen(192), 192, 'public/icons/icon-192.png');
  await shoot(page, gen(512), 512, 'public/icons/icon-512.png');
  await shoot(page, gen(512, true), 512, 'public/icons/icon-maskable-512.png');
  // Manifest: bump cache-buster to v3, ensure maskable entry
  let mjson = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
  mjson.icons = [
    { src: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  fs.writeFileSync('public/manifest.json', JSON.stringify(mjson, null, 2) + '\n');
  console.log('manifest updated (v3, maskable added) — variant', V);
}
await browser.close();
