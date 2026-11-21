const fs=require('node:fs');
let html=fs.readFileSync('outputs/index.html','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${fs.readFileSync('outputs/style.css','utf8')}</style>`);
html=html.replace('<script src="arena.js"></script><script src="game.js"></script>',()=>`<script>${fs.readFileSync('outputs/arena.js','utf8')}</script><script>${fs.readFileSync('outputs/game.js','utf8')}</script>`);
fs.writeFileSync('outputs/双人默契大乱斗-双击即玩.html',html,'utf8');
console.log(`Standalone game built (${Buffer.byteLength(html)} bytes).`);
