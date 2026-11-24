// Refreshes src/menu.json from the live Talabat store page (English + Arabic).
// Usage: npm run fetch-menu [-- <talabat store url>]
import { writeFile } from 'node:fs/promises';

const url = (process.argv[2] || 'https://www.talabat.com/egypt/restaurant/1124298/bakali-el-salam-hassan-radwan').split('?')[0];
const arUrl = url.replace('talabat.com/', 'talabat.com/ar/');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

async function menu(u) {
  const html = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`No menu data found at ${u}`);
  return JSON.parse(m[1]).props.pageProps.initialMenuState.menuData;
}

const [en, ar] = await Promise.all([menu(url), menu(arUrl)]);
const arItems = new Map(ar.items.map((i) => [i.id, i]));
const arCats = new Map(ar.categories.map((c) => [c.id, c.name.trim()]));

// "Picks for you" and "Offers" repeat items from the real categories, which come
// later in the list, so each item belongs to the last category it appears in.
const home = new Map();
en.categories.forEach((c, ci) => c.items.forEach((i) => home.set(i.id, { c, ci, i })));

const items = [...home.values()]
  .sort((a, b) => a.ci - b.ci || a.c.items.indexOf(a.i) - b.c.items.indexOf(b.i))
  .map(({ c, i }) => {
    const a = arItems.get(i.id) || i;
    return {
      id: i.id,
      catEn: c.name.trim(),
      catAr: arCats.get(c.id) || c.name.trim(),
      nameEn: i.name.trim(),
      nameAr: a.name.trim(),
      descEn: (i.description || '').trim(),
      descAr: (a.description || '').trim(),
      regular: i.oldPrice || i.price,
      sale: i.oldPrice ? i.price : null,
      image: i.image,
    };
  });

const id = Number(url.match(/restaurant\/(\d+)/)?.[1]);
await writeFile(new URL('../src/menu.json', import.meta.url), JSON.stringify({ store: { id, name: 'Bakali El Salam', url }, items }, null, 1));
console.log(`Saved ${items.length} items.`);
