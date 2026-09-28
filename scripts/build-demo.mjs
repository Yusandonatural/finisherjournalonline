// dist/demo の JS と CSS を1枚の HTML に埋め込み、アーティファクトとして公開できる形にする
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = 'dist/demo/assets';
const files = readdirSync(dir);
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8');
const html = `<title>目標達成ジャーナル</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>${css}</style>
<div id="root"><div class="loading">読み込み中…</div></div>
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-asm.js"></script>
<script type="module">${js}</script>
`;
writeFileSync('dist/demo/finisher-journal-demo.html', html);
console.log('dist/demo/finisher-journal-demo.html', (html.length / 1024).toFixed(0) + 'KB');
