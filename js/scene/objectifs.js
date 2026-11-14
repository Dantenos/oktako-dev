// Les objectifs du tiroir (lot portfolio-bureau-range) : leurs corps sont cuits ; leur verre frontal est calculé ici, comme le
// café : un miroir de la pièce (le cube capturé par cafe.js), bombé, teinté par le traitement du verre. Au survol, une image
// passe « à travers » : la vidéo, sinon le poster, légèrement courbée et vignettée, le reflet par-dessus. Une vidéo ne se
// télécharge qu'au survol de SON objectif, jamais avant (voir lancer). Les noms gravés sur les bagues viennent du contenu.
import * as THREE from 'three';

// Le miroir d'un verre frontal, partagé avec le grand angle (fisheye.js) : une seule formule, un seul cube. n et v viennent du repère où le verre regarde vers le haut.
export const MIROIR_VERRE = `
  vec3 miroirVerre(samplerCube env, vec3 n, vec3 v, out float f) {
    vec3 R = reflect(-v, n);
    f = 0.06 + 0.94 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
    return textureCube(env, vec3(-R.x, R.y, R.z)).rgb;
  }`;

function materiauVerre(env) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: { tEnv: { value: env }, tImage: { value: null }, uVoir: { value: 0 }, uAvecImage: { value: 0 }, uLumiere: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vMonde; void main(){ vUv = uv; vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: `
      uniform samplerCube tEnv; uniform sampler2D tImage; uniform float uVoir, uAvecImage, uLumiere; varying vec2 vUv; varying vec3 vMonde;
      ${MIROIR_VERRE}
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p);
        // Bombé du ménisque : la normale s'écarte vers le bord, le reflet s'y resserre comme sur un vrai verre frontal.
        vec3 n = normalize(vec3(p.x * 0.55, 1.0, -p.y * 0.55));
        vec3 v = normalize(cameraPosition - vMonde);
        float f; vec3 miroir = miroirVerre(tEnv, n, v, f);
        // Le traitement antireflet : magenta d'un côté, vert de l'autre, plus fort près du bord.
        vec3 traitement = mix(vec3(0.62, 0.28, 0.72), vec3(0.3, 0.62, 0.42), smoothstep(-0.8, 0.8, p.x + p.y * 0.4));
        vec3 reflet = miroir * mix(vec3(1.0), traitement * 1.7, smoothstep(0.1, 0.95, r));
        vec3 fond = vec3(0.012, 0.014, 0.02) + vec3(0.05, 0.03, 0.07) * (1.0 - r);
        // L'image, vue à travers : tonneau du verre, vignettage rond.
        vec2 q = 0.5 + 0.5 * p * (0.8 + 0.16 * r * r);
        vec3 image = texture2D(tImage, vec2(q.x, q.y)).rgb * (1.0 - 0.72 * r * r * r) * uLumiere;
        vec3 col = mix(fond + reflet * (0.13 + f * 0.7), image + reflet * (0.06 + f * 0.4), uVoir * uAvecImage);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
// La bague gravée : un anneau transparent, le nom en lettres crème, un tour de cercle.
function peindreBague(texte, n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); g.translate(n / 2, n / 2); g.fillStyle = '#e8dcc2';
  g.font = `600 ${Math.round(n * 0.052)}px ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const t = [...texte.toUpperCase()], pas = 2 * Math.PI / Math.max(t.length, 34);
  t.forEach((l, i) => { g.save(); g.rotate((i - (t.length - 1) / 2) * pas); g.translate(0, -n * 0.455); g.fillText(l, 0, 0); g.restore(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

// Sans poster, le verre dit « bientôt » : la vidéo de cet outil n'existe pas encore.
function peindreBientot(nom, n = 256) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); g.fillStyle = '#17120d'; g.fillRect(0, 0, n, n); g.fillStyle = '#e8dcc2'; g.textAlign = 'center';
  g.font = `400 ${n * 0.14}px Georgia, "Iowan Old Style", serif`; g.fillText('bientôt', n / 2, n * 0.52);
  g.font = `400 ${n * 0.075}px ui-monospace, Consolas, "DejaVu Sans Mono", monospace`; g.fillText(nom, n / 2, n * 0.66, n * 0.74);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// parent : le groupe du tiroir (les verres glissent avec lui) ; reperes : centre et rayon de chaque verre ; liste : le contenu.
export function creerObjectifs({ parent, reperes, liste, env, base, demarrer, mouvementReduit }) {
  const chargeur = new THREE.TextureLoader(), objs = [], demandes = [];
  const geoVerre = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  reperes.forEach((r, i) => {
    const c = liste[i]; if (!c) return;
    const m = new THREE.Mesh(geoVerre, materiauVerre(env));
    m.scale.setScalar(r.rayon); m.position.fromArray(r.centre); m.userData.objectif = i; parent.add(m);
    // La bague, sur le chanfrein qui entoure le verre : posée 0,6 mm au-dessus, jamais dans le même plan.
    const bague = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: peindreBague(c.gravure), transparent: true, depthWrite: false, toneMapped: false }));
    bague.scale.setScalar(r.rayon * 2.42); bague.position.fromArray(r.centre); bague.position.y += 0.0052; parent.add(bague);
    objs.push({ i, c, m, voir: 0, but: 0, poster: null, video: null, tex: null, enCours: false });
  });
  // Le poster arrive à l'ouverture du tiroir : quelques dizaines de Ko chacun, et il faut bien montrer quelque chose.
  function preparer() {
    for (const o of objs) {
      if (!o.c.poster && !o.tex) peindre(o, peindreBientot(o.c.nom));
      if (o.poster || !o.c.poster) continue;
      o.poster = chargeur.load(new URL(o.c.poster, base).href, (t) => { if (!o.tex) peindre(o, t); demarrer(); });
      o.poster.colorSpace = THREE.SRGBColorSpace;
    }
  }
  function peindre(o, t) { o.tex = t; o.m.material.uniforms.tImage.value = t; o.m.material.uniforms.uAvecImage.value = 1; }
  // La vidéo de cet objectif, créée ici et nulle part ailleurs. Rien en mouvement réduit : le poster suffit.
  function lancer(o) {
    if (!o.c.video || mouvementReduit()) return false;
    if (!o.video) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.setAttribute('aria-hidden', 'true');
      v.src = new URL(o.c.video, base).href; demandes.push(o.c.id);
      v.addEventListener('playing', () => { const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; o.vtex = t; peindre(o, t); demarrer(); });
      o.video = v;
    }
    o.video.play().catch(() => { /* lecture refusée : le poster reste, rien à signaler */ });
    return true;
  }
  return {
    preparer,
    // i : l'objectif visé, null pour aucun. Le reflet revient seul (« voir ou non » : on quitte, l'image s'efface).
    viser(i) {
      for (const o of objs) {
        o.but = o.i === i ? 1 : 0;
        if (o.but) lancer(o); else if (o.video && !o.video.paused) o.video.pause();
      }
      demarrer();
    },
    mettreAJour(dt, anime) {
      let bouge = false;
      for (const o of objs) {
        o.voir += (o.but - o.voir) * (anime ? Math.min(1, dt * 7) : 1);
        o.m.material.uniforms.uVoir.value = o.voir;
        if (Math.abs(o.voir - o.but) > 0.01) bouge = true;
        if (o.but && o.video && !o.video.paused) bouge = true;
      }
      return bouge;
    },
    regler(l) { for (const o of objs) o.m.material.uniforms.uLumiere.value = l; },
    verres: objs.map((o) => o.m),
    etat: () => ({ demandes: [...demandes], objectifs: objs.map((o) => ({ id: o.c.id, voir: +o.voir.toFixed(3), poster: !!o.poster, video: !!o.video, joue: !!o.video && !o.video.paused, image: !!o.tex })) }),
  };
}
