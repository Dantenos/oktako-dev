// Les deux surfaces vivantes de l'atelier : le verre bombé du petit terminal Rouille (texture vivante de v86 pendant
// la plongée) et l'écran « Qui suis-je ». Tout le reste du décor vient de Blender, lumière cuite (modele.js).
import * as THREE from 'three';

// La courbure existe dans la géométrie : les reflets et les silhouettes suivent le tube.
export function tubeCathodique(l, h, bombe) {
  const geo = new THREE.PlaneGeometry(l, h, 24, 18), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (l / 2), y = p.getY(i) / (h / 2);
    p.setZ(i, bombe * (1 - x*x) * (1 - y*y));
  }
  geo.computeVertexNormals(); return geo;
}

// Verre du petit tube : bombé, lignes de balayage et halo du phosphore quand on le regarde de loin.
// uEffet descend à 0 en fin de plongée : le shader rend alors le canevas tel quel, pixel pour pixel,
// pour que le relais vers le canevas DOM (même rectangle, mêmes coins arrondis) ne se voie pas.
export const ARRONDI_TUBE = 0.035; // rayon des coins, en fraction de la hauteur de la dalle
export function materiauTube(tex) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: { map: { value: tex }, uTemps: { value: 0 }, uEffet: { value: 1 }, uAttente: { value: 0 }, uArrondi: { value: ARRONDI_TUBE } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float uTemps, uEffet, uAttente, uArrondi; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        // Coins du tube, sur la géométrie non déformée : le cadre DOM porte le même rayon.
        vec2 p = (vUv - 0.5) * vec2(4.0 / 3.0, 1.0), b = vec2(2.0 / 3.0, 0.5) - uArrondi;
        float d = length(max(abs(p) - b, 0.0)) - uArrondi;
        float dedans = 1.0 - smoothstep(-fwidth(d), 0.0, d);
        vec2 c = vUv - 0.5;
        // Distorsion en tonneau du verre bombé, qui se redresse pendant la traversée.
        vec2 uv = 0.5 + c * (1.0 - 0.045 * uEffet + 0.17 * uEffet * dot(c, c));
        float cadre = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        vec3 col = texture2D(map, uv).rgb;
        // Halo du phosphore : quatre prises larges, ajoutées seulement tant que le verre se voit.
        vec3 halo = texture2D(map, uv + vec2(0.006, 0.0)).rgb + texture2D(map, uv - vec2(0.006, 0.0)).rgb
          + texture2D(map, uv + vec2(0.0, 0.008)).rgb + texture2D(map, uv - vec2(0.0, 0.008)).rgb;
        col += halo * 0.07 * uEffet;
        // Lignes de balayage effacées quand elles deviendraient plus fines qu'un pixel (sinon moiré).
        float densite = fwidth(uv.y) * 300.0;
        float lignes = 0.86 + 0.14 * sin(uv.y * 600.0 * 3.14159);
        col *= mix(1.0, lignes, uEffet * (1.0 - smoothstep(0.35, 0.7, densite)));
        // Démarrage : neige et barre de synchronisation qui défile, tant que Rouille n'a pas d'image.
        float neige = h(floor(vUv * vec2(320.0, 240.0)) + fract(uTemps * 7.0)) - 0.5;
        float barre = smoothstep(0.08, 0.0, abs(fract(vUv.y - uTemps * 0.21) - 0.5) - 0.38);
        col += (neige * 0.07 + barre * 0.05) * uAttente;
        col *= 1.0 - dot(c, c) * 1.1 * uEffet;
        col *= 0.985 + 0.015 * sin(uTemps * 50.0) * uEffet;
        gl_FragColor = vec4(col * cadre * dedans, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Écran « Qui suis-je » : courbure, balayage et scintillement d'un vieux tube, sur la page dessinée en canevas.
export function materiauEcran(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { tEcran: { value: tex }, uTemps: { value: 0 }, uLueur: { value: 1 }, uSurvol: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tEcran; uniform float uTemps, uLueur, uSurvol; varying vec2 vUv;
      void main(){
        // Courbure du tube : léger bombé, coins assombris.
        vec2 c = vUv - 0.5; vec2 uv = 0.5 + c * (1.0 + dot(c, c) * 0.18);
        vec3 t = texture2D(tEcran, uv).rgb;
        float bord = smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
        float lignes = 0.82 + 0.18 * sin(uv.y * 768.0 * 3.14159);
        float scintille = 0.97 + 0.03 * sin(uTemps * 60.0) * sin(uTemps * 7.3);
        float balayage = 0.06 * smoothstep(0.0, 0.02, 0.02 - abs(fract(uv.y * 0.5 - uTemps * 0.12) - 0.5) * 0.04);
        vec3 col = t * lignes * scintille * bord + balayage * bord;
        col *= 1.0 - dot(c, c) * 0.9;
        gl_FragColor = vec4(col * (1.35 + uSurvol * 0.35) * uLueur, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
