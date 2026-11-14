// Vitre mouillée : la ville (rendue à part dans une cible) est vue à travers une buée floue ;
// les gouttes, posées ou glissantes, font office de petites lentilles nettes. Shader écrit pour ce projet.
import * as THREE from 'three';

export function materiauVitre(cible) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDehors: { value: cible.texture },
      uTemps: { value: 0 },
      uPluie: { value: 1 },
      uFlou: { value: 3.2 },
      uTeinte: { value: new THREE.Color() },
      // Ciel vivant : buée d'hiver au bas de la vitre, neige posée sur le rebord, reflet d'un éclair.
      uBuee: { value: 0 }, uNeige: { value: 0 }, uNeigeLumiere: { value: 1 }, uEclair: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vMonde; varying vec2 vUv; varying vec4 vClip;
      void main() {
        vec4 m = modelMatrix * vec4(position, 1.0);
        vMonde = m.xyz; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * m; vClip = gl_Position;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDehors; uniform float uTemps, uPluie, uFlou, uBuee, uNeige, uNeigeLumiere, uEclair; uniform vec3 uTeinte;
      varying vec3 vMonde; varying vec2 vUv; varying vec4 vClip;
      float h(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      // Gouttes posées : une par cellule (ou aucune), décalage proportionnel à la position dans la goutte.
      vec3 posees(vec2 uv) {
        vec2 id = floor(uv), st = fract(uv) - 0.5;
        float n = h(id);
        vec2 p = (vec2(h(id + 7.1), h(id + 3.7)) - 0.5) * 0.6;
        float existe = step(0.45, n);
        float r = mix(0.07, 0.2, h(id + 1.3));
        vec2 dv = st - p; float d = length(dv * vec2(1.0, 1.2));
        // Une cellule sans goutte doit rendre exactement zéro (smoothstep(0,0,x) est indéfini en GLSL).
        float m = smoothstep(r, r * 0.5, d) * existe;
        return vec3(dv / max(r, 1e-3) * m, m);
      }
      // Gouttes qui glissent : colonnes hautes défilant à vitesses différentes, avec une traînée qui efface la buée.
      vec4 glissantes(vec2 uv, float t) {
        uv.x *= 1.0; float col = floor(uv.x);
        float v = mix(0.05, 0.16, h(vec2(col, 4.0)));
        vec2 g = vec2(uv.x, uv.y * 0.22 + t * v + h(vec2(col, 9.0)) * 7.0);
        vec2 id = floor(g); vec2 st = fract(g) - 0.5;
        float n = h(id + 0.37);
        if (n < 0.55) return vec4(0.0);
        float x = (h(id + 2.1) - 0.5) * 0.5 + sin(g.y * 9.0 + n * 6.0) * 0.04;
        float y = (n - 0.75) * 0.6;
        vec2 dv = (st - vec2(x, y)) * vec2(1.0, 4.4);
        float m = smoothstep(0.14, 0.05, length(dv));
        float trace = smoothstep(0.05, 0.0, abs(st.x - x)) * smoothstep(y - 0.02, y + 0.35, st.y) * step(y, st.y) * (1.0 - smoothstep(y + 0.1, y + 0.5, st.y));
        return vec4(dv * m * 0.9, m, trace);
      }
      void main() {
        // Où la caméra voit ce point, tiré de sa projection et non de gl_FragCoord : la cible du post-traitement peut
        // avoir une autre taille que celle qu'on croit (qualité adaptative), et la ville glissait puis s'étirait en haut.
        vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
        vec2 uv = vMonde.xy * 9.0;
        vec3 a = posees(uv * 1.6), b = posees(uv * 3.3 + 11.0);
        vec4 c = glissantes(uv * vec2(0.9, 1.0), uTemps);
        float masque = max(max(a.z, b.z * 0.8), c.z) * uPluie;
        vec2 decal = (a.xy * a.z + b.xy * b.z * 0.6 + c.xy * c.z) * uPluie;
        float net = clamp(masque + c.w * 0.9 * uPluie, 0.0, 1.0);
        float lod = mix(uFlou, 0.2, net) * (0.6 + 0.4 * uPluie);
        // Une goutte inverse et resserre l'image : on échantillonne un peu plus loin, vers le haut.
        vec3 dehors = textureLod(tDehors, suv - decal * 0.035 + vec2(0.0, masque * 0.006), lod).rgb;
        vec3 flou = textureLod(tDehors, suv, uFlou + 1.5).rgb;
        vec3 col = mix(dehors, mix(dehors, flou, 0.18), (1.0 - net) * uPluie);
        // Buée légère, teintée par la nuit (froide) ; bord des gouttes plus sombre.
        col = mix(col, uTeinte, (1.0 - net) * 0.06 * uPluie);
        col *= 1.0 - smoothstep(0.55, 1.0, masque) * 0.0 - (masque * (1.0 - masque)) * 0.6;
        col += masque * 0.015;
        // Hiver : la buée monte du bas de la vitre (plus floue, plus claire), les gouttes y ont tracé leur chemin.
        float bord = h(floor(vUv * vec2(40.0, 1.0)));
        float buee = uBuee * smoothstep(0.38 + bord * 0.06, 0.02, vUv.y) * (1.0 - net * 0.75);
        col = mix(col, mix(flou, uTeinte * 2.2 + 0.04, 0.55), buee * 0.8);
        // Neige posée sur le rebord, dehors : un bourrelet blanc irrégulier au pied de chaque carreau.
        float crete = 0.035 + 0.03 * (sin(vUv.x * 37.0) * 0.5 + 0.5) * h(floor(vUv * vec2(18.0, 1.0)) + 3.0);
        col = mix(col, vec3(0.86, 0.9, 0.96) * uNeigeLumiere, uNeige * smoothstep(crete, crete - 0.012, vUv.y));
        col += vec3(0.75, 0.8, 1.0) * uEclair * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Pluie dehors : traits fins, au-delà de la vitre, dans la couche « dehors » seulement.
export function pluieDehors(n = 900) {
  const pos = new Float32Array(n * 6), graine = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 6, y = Math.random() * 5 - 1, z = -1.6 - Math.random() * 5;
    const l = 0.06 + Math.random() * 0.08;
    pos.set([x, y, z, x - 0.004, y - l, z], i * 6);
    graine.set([Math.random(), Math.random()], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const g2 = new Float32Array(n * 2); for (let i = 0; i < n; i++) { g2[i * 2] = graine[i * 2]; g2[i * 2 + 1] = graine[i * 2]; }
  geo.setAttribute('graine', new THREE.BufferAttribute(g2, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    // uDensite : part des traits qui tombent (pluie fine ou averse) ; uVitesse : l'averse tombe plus vite.
    uniforms: { uTemps: { value: 0 }, uIntensite: { value: 1 }, uCouleur: { value: new THREE.Color() }, uDensite: { value: 1 }, uVitesse: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float graine; uniform float uTemps, uDensite, uVitesse; varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTemps * uVitesse * (3.2 + graine * 1.5) + 1.0, 5.0) - 1.0;
        // Un trait au-delà de la densité voulue sort du cadre (derrière la caméra), sans changer la géométrie.
        if (graine > uDensite) p.z = 50.0;
        vA = 0.25 + graine * 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uIntensite; uniform vec3 uCouleur; varying float vA;
      void main() { gl_FragColor = vec4(uCouleur * vA * uIntensite, 1.0); }`,
  });
  return new THREE.LineSegments(geo, mat);
}
