/**
 * generate-og-image.mjs
 *
 * Generates a 1200×630 OG image for demo.aikart.com using Node.js canvas.
 * Pure Canvas2D — no external image dependencies.
 *
 * Usage: node generate-og-image.mjs
 * Output: public/og-image.png
 *
 * Requires: npm install canvas  (node-canvas)
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

const W = 1200;
const H = 630;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// ── Background: dark gradient ──
const bgGrad = ctx.createLinearGradient(0, 0, W, H);
bgGrad.addColorStop(0, '#0a0a1a');
bgGrad.addColorStop(0.5, '#0f0f2e');
bgGrad.addColorStop(1, '#0a0a1a');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// ── Subtle grid pattern ──
ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)';
ctx.lineWidth = 1;
for (let x = 0; x < W; x += 40) {
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
}
for (let y = 0; y < H; y += 40) {
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
}

// ── Accent glow blob (top-right) ──
const glowGrad = ctx.createRadialGradient(900, 150, 0, 900, 150, 300);
glowGrad.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
glowGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.06)');
glowGrad.addColorStop(1, 'transparent');
ctx.fillStyle = glowGrad;
ctx.fillRect(0, 0, W, H);

// ── Second glow blob (bottom-left) ──
const glow2 = ctx.createRadialGradient(300, 500, 0, 300, 500, 250);
glow2.addColorStop(0, 'rgba(236, 72, 153, 0.1)');
glow2.addColorStop(1, 'transparent');
ctx.fillStyle = glow2;
ctx.fillRect(0, 0, W, H);

// ── "AI-KART" main title ──
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Gradient text simulation (solid white with slight opacity layering)
ctx.font = 'bold 96px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
ctx.letterSpacing = '12px';

// Shadow for depth
ctx.shadowColor = 'rgba(99, 102, 241, 0.4)';
ctx.shadowBlur = 40;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;

// Text with gradient fill
const titleGrad = ctx.createLinearGradient(400, 230, 800, 230);
titleGrad.addColorStop(0, '#6366f1');
titleGrad.addColorStop(0.5, '#a855f7');
titleGrad.addColorStop(1, '#ec4899');
ctx.fillStyle = titleGrad;
ctx.fillText('AI-KART', W / 2, 250);

// Reset shadow
ctx.shadowColor = 'transparent';
ctx.shadowBlur = 0;

// ── Subtext line ──
ctx.font = '300 28px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
ctx.fillText('Virtual Try-On. Browser-Native. Zero Data.', W / 2, 340);

// ── Pill badge ──
const badgeText = 'AR GARMENT ENGINE';
ctx.font = '600 14px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const badgeW = ctx.measureText(badgeText).width + 32;
const badgeX = (W - badgeW) / 2;
const badgeY = 400;

// Pill background
ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
ctx.beginPath();
ctx.roundRect(badgeX, badgeY, badgeW, 32, 16);
ctx.fill();

// Pill text
ctx.fillStyle = '#a78bfa';
ctx.textAlign = 'center';
ctx.fillText(badgeText, W / 2, badgeY + 17);

// ── Bottom URL ──
ctx.font = '400 16px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
ctx.fillStyle = 'rgba(100, 116, 139, 0.7)';
ctx.fillText('demo.aikart.com', W / 2, H - 50);

// ── Border frame ──
ctx.strokeStyle = 'rgba(30, 30, 46, 0.8)';
ctx.lineWidth = 2;
ctx.strokeRect(1, 1, W - 2, H - 2);

// ── Export ──
const buffer = canvas.toBuffer('image/png');
writeFileSync('public/og-image.png', buffer);
console.log(`✅ Generated og-image.png (${(buffer.length / 1024).toFixed(0)} KB)`);
