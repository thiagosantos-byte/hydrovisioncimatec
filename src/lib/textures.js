import * as THREE from 'three';

/**
 * Texturas procedurais (canvas) — evitam dependência de arquivos externos e
 * dão rugosidade, manchas e micro-relevo às superfícies industriais.
 * Todas são geradas sob demanda e reaproveitadas (cache por tipo/tema).
 */

const cache = new Map();

function canvasTexture(key, width, height, paint, { srgb = false, repeat = [1, 1] } = {}) {
  const id = `${key}:${width}x${height}:${repeat.join('x')}:${srgb}`;
  if (cache.has(id)) return cache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  cache.set(id, texture);
  return texture;
}

function noise(ctx, width, height, amount, alpha) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    data[i + 3] = Math.round(data[i + 3] * alpha);
  }
  ctx.putImageData(image, 0, 0);
}

/** Rugosidade de aço escovado: faixas horizontais finas. */
export function brushedMetalTexture(repeat = [6, 6]) {
  return canvasTexture('brushed', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i += 1) {
      const y = Math.random() * h;
      const len = 40 + Math.random() * 240;
      const x = Math.random() * w;
      const shade = 110 + Math.random() * 90;
      ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.12 + Math.random() * 0.2})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    noise(ctx, w, h, 16, 1);
  }, { repeat });
}

/** Rugosidade de pintura industrial: leve casca de laranja e desgaste. */
export function paintedMetalTexture(repeat = [4, 4], tint = '#9a9a9a') {
  return canvasTexture(`painted:${tint}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 1 + Math.random() * 4;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    noise(ctx, w, h, 26, 1);
  }, { repeat });
}

/** Concreto polido industrial com manchas e juntas. */
export function concreteTexture(theme = 'dark') {
  const base = theme === 'dark' ? '#5d5f5e' : '#a9a7a0';
  return canvasTexture(`concrete:${theme}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 18 + Math.random() * 120;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() > 0.5;
      grad.addColorStop(0, dark ? 'rgba(25,30,32,.16)' : 'rgba(255,255,255,.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 1800; i += 1) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    ctx.strokeStyle = 'rgba(20,24,26,.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(20,24,26,.2)';
    for (let x = 0; x <= h; x += h / 4) {
      ctx.beginPath();
      ctx.moveTo(0, x);
      ctx.lineTo(w, x);
      ctx.stroke();
    }
    noise(ctx, w, h, 20, 1);
  }, { repeat: [3, 3], srgb: true });
}

/** Normal map suave de micro-relevo para concreto e chapas. */
export function microNormalTexture(repeat = [8, 8]) {
  return canvasTexture('micro-normal', 256, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const data = image.data;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const nx = 128 + Math.sin(x * 0.23 + y * 0.07) * 22 + (Math.random() - 0.5) * 26;
        const ny = 128 + Math.cos(y * 0.19 + x * 0.05) * 22 + (Math.random() - 0.5) * 26;
        data[i] = nx;
        data[i + 1] = ny;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, { repeat });
}

/** Placa de identificação desenhada em canvas (sem dependência de fontes externas). */
export function nameplateTexture(title, subtitle = '', code = '') {
  return canvasTexture(`plate:${title}:${subtitle}:${code}`, 512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#e9eef0');
    grad.addColorStop(1, '#b9c4c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6c7b80';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#1c343d';
    ctx.font = 'bold 46px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase().slice(0, 18), w / 2, 94);
    ctx.font = '26px Arial';
    ctx.fillStyle = '#33525c';
    ctx.fillText(subtitle.slice(0, 34), w / 2, 142);
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = '#0f5f86';
    ctx.fillText(code.slice(0, 18), w / 2, 200);
    // parafusos nos cantos
    ctx.fillStyle = '#8c9a9e';
    [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    });
  }, { srgb: true });
}

/** Faixa de sinalização amarelo/preto usada no piso e nos guarda-corpos. */
export function hazardStripeTexture(repeat = [6, 1]) {
  return canvasTexture('hazard', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d2326';
    for (let x = -h; x < w + h; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 32, h);
      ctx.lineTo(x + 32 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.closePath();
      ctx.fill();
    }
    noise(ctx, w, h, 18, 1);
  }, { repeat, srgb: true });
}

/** Rótulo de segurança simples (fundo branco, tarja colorida e texto). */
export function signTexture(title, subtitle = '', accent = '#d9a63b') {
  return canvasTexture(`sign:${title}:${subtitle}:${accent}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f4f6f4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3b4b50';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = accent;
    ctx.fillRect(12, 12, w - 24, 64);
    ctx.fillStyle = '#12232b';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title.slice(0, 16), w / 2, 56);
    ctx.fillStyle = '#24373d';
    ctx.font = '22px Arial';
    subtitle.split('|').slice(0, 3).forEach((line, index) => {
      ctx.fillText(line.slice(0, 20), w / 2, 130 + index * 34);
    });
  }, { srgb: true });
}

/** Textura de água: manchas claras/escuras para causticas discretas. */
export function causticTexture(repeat = [2, 2]) {
  return canvasTexture('caustic', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0d3b4d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 34; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 8 + Math.random() * 46;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(190,240,255,.55)');
      grad.addColorStop(0.55, 'rgba(90,190,220,.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, { repeat });
}

/** Chapa ondulada de fábrica: relevo vertical usado na alvenaria industrial. */
export function corrugatedTexture(repeat = [10, 4]) {
  return canvasTexture('corrugated', 256, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const data = image.data;
    const period = w / 16;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const phase = (x % period) / period;
        const slope = Math.cos(phase * Math.PI * 2);
        const nx = 128 + slope * 90;
        data[i] = nx;
        data[i + 1] = 128;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, { repeat });
}
