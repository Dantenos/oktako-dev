// Bloc-notes du terminal Rouille : notes locales dans IndexedDB, jamais envoyées.
// Pourquoi un magasin unique partagé : la rubrique existe deux fois (présentation et panneau) ; les deux vues
// lisent et écrivent le même état, sinon fermer le panneau ferait réapparaître une version périmée.
// Rendu : uniquement textContent et value — le contenu d'une note n'est jamais interprété comme du HTML.

export const BASE = 'majortakito-notes';
export const SCHEMA = 2;
export const LIMITES = { notes: 50, texte: 20000, titre: 120, fichier: 256 * 1024 };
export const FORMAT = 'majortakito-notes';

const maintenant = () => new Date().toISOString();
const nettoyer = (t) => String(t ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
export const titreDe = (texte) => (nettoyer(texte).split('\n').find((l) => l.trim()) || 'Note sans titre').trim().slice(0, LIMITES.titre);
const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const dateValide = (d) => (typeof d === 'string' && !Number.isNaN(Date.parse(d)) ? new Date(d).toISOString() : maintenant());

// Migration d'un enregistrement d'une version de schéma à la suivante. Pure : sert à IndexedDB et à l'import.
// v1 : { id, texte, maj }   v2 : { id, titre, texte, creee, maj }
export function migrerNote(n, depuis) {
  let r = { ...n };
  if (depuis < 2) { r = { id: r.id || nouvelId(), titre: titreDe(r.texte), texte: nettoyer(r.texte), creee: dateValide(r.maj), maj: dateValide(r.maj) }; }
  return r;
}

function requete(r) { return new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); }
function transaction(db, magasins, mode, travail) {
  return new Promise((ok, ko) => {
    let tx;
    try { tx = db.transaction(magasins, mode); travail(tx); } catch (e) { ko(e); return; }
    tx.oncomplete = () => ok(); tx.onabort = () => ko(tx.error || new DOMException('Transaction annulée', 'AbortError')); tx.onerror = () => {};
  });
}

export function ouvrirBase() {
  return new Promise((ok, ko) => {
    let r;
    try { r = indexedDB.open(BASE, SCHEMA); } catch (e) { ko(e); return; }
    r.onupgradeneeded = (e) => {
      const db = r.result, tx = r.transaction, ancienne = e.oldVersion;
      // Chaque marche de migration ne s'exécute qu'une fois, dans l'ordre ; une base neuve passe par toutes.
      if (ancienne < 1) db.createObjectStore('notes', { keyPath: 'id' });
      if (ancienne < 2) {
        const notes = tx.objectStore('notes');
        notes.createIndex('maj', 'maj');
        notes.openCursor().onsuccess = (ev) => { const c = ev.target.result; if (!c) return; c.update(migrerNote(c.value, 1)); c.continue(); };
        db.createObjectStore('meta', { keyPath: 'cle' }).put({ cle: 'schema', valeur: 2, migreDe: ancienne, le: maintenant() });
      }
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new DOMException('Base bloquée par un autre onglet', 'InvalidStateError'));
  });
}

// --- Magasin partagé ---
const abonnes = new Set();
const etat = { statut: 'chargement', notes: [], erreur: '', schema: SCHEMA, migreDe: null };
let db = null, demarre = null;
const prevenir = () => abonnes.forEach((f) => f(etat));
const trier = () => etat.notes.sort((a, b) => b.maj.localeCompare(a.maj));

function echec(e) {
  // Quota plein ou stockage refusé : les notes restent en mémoire et l'export reste possible.
  etat.statut = e?.name === 'QuotaExceededError' ? 'plein' : 'memoire';
  etat.erreur = e?.name || 'Erreur';
  prevenir();
}
async function ecrire(travail) {
  if (!db) return;
  try { await transaction(db, ['notes'], 'readwrite', travail); if (etat.statut === 'plein') { etat.statut = 'pret'; prevenir(); } } catch (e) { echec(e); }
}

export function demarrer() {
  demarre ??= (async () => {
    try {
      if (!('indexedDB' in window) || !window.indexedDB) throw new DOMException('IndexedDB absent', 'SecurityError');
      db = await ouvrirBase();
      db.onversionchange = () => { db.close(); db = null; etat.statut = 'memoire'; etat.erreur = 'VersionChange'; prevenir(); };
      const t = db.transaction(['notes', 'meta'], 'readonly');
      const [notes, meta] = await Promise.all([requete(t.objectStore('notes').getAll()), requete(t.objectStore('meta').get('schema'))]);
      etat.notes = notes; etat.migreDe = meta?.migreDe ?? null; etat.statut = 'pret'; trier();
    } catch (e) { db = null; echec(e); }
    prevenir();
  })();
  return demarre;
}
export const magasin = {
  etat,
  abonner(f) { abonnes.add(f); f(etat); return () => abonnes.delete(f); },
  creer() {
    if (etat.notes.length >= LIMITES.notes) return null;
    const n = { id: nouvelId(), titre: 'Note sans titre', texte: '', creee: maintenant(), maj: maintenant() };
    etat.notes.unshift(n); prevenir(); ecrire((tx) => tx.objectStore('notes').put(n)); return n;
  },
  modifier(id, texte) {
    const n = etat.notes.find((x) => x.id === id); if (!n) return;
    n.texte = nettoyer(texte).slice(0, LIMITES.texte); n.titre = titreDe(n.texte); n.maj = maintenant();
    prevenir(); return ecrire((tx) => tx.objectStore('notes').put({ ...n }));
  },
  supprimer(id) { etat.notes = etat.notes.filter((x) => x.id !== id); prevenir(); return ecrire((tx) => tx.objectStore('notes').delete(id)); },
  toutEffacer() { etat.notes = []; prevenir(); return ecrire((tx) => tx.objectStore('notes').clear()); },
  importer(notes, mode) {
    const neuves = notes.map((n) => ({ ...n, id: nouvelId() }));
    etat.notes = mode === 'remplacer' ? neuves : [...neuves, ...etat.notes]; trier(); prevenir();
    return ecrire((tx) => { const s = tx.objectStore('notes'); if (mode === 'remplacer') s.clear(); neuves.forEach((n) => s.put(n)); });
  },
};

// --- Export / import bornés ---
export function exporterJSON(notes) {
  return JSON.stringify({ format: FORMAT, schema: SCHEMA, exporte: maintenant(), notes: notes.map(({ titre, texte, creee, maj }) => ({ titre, texte, creee, maj })) }, null, 2);
}
export function exporterTexte(notes) {
  return notes.map((n) => `=== ${n.titre} (${n.maj.slice(0, 10)}) ===\n${n.texte}`).join('\n\n') + '\n';
}
// Analyse un fichier importé ; renvoie { notes } ou { erreur }. Rien n'est écrit avant confirmation.
export function analyserImport(nom, texte) {
  if (texte.length > LIMITES.fichier) return { erreur: `Fichier trop gros (limite ${LIMITES.fichier / 1024} Ko).` };
  if (/\.json$/i.test(nom) || /^\s*\{/.test(texte)) {
    let d; try { d = JSON.parse(texte); } catch { return { erreur: 'JSON illisible.' }; }
    if (!d || d.format !== FORMAT || !Array.isArray(d.notes)) return { erreur: 'Ce fichier n\'est pas un export du bloc-notes MajorTakito.' };
    if (!Number.isInteger(d.schema) || d.schema < 1 || d.schema > SCHEMA) return { erreur: `Version de schéma non prise en charge (${String(d.schema).slice(0, 10)}).` };
    if (d.notes.length > LIMITES.notes) return { erreur: `Trop de notes (${d.notes.length}, limite ${LIMITES.notes}).` };
    const notes = [];
    for (const brute of d.notes) {
      if (!brute || typeof brute.texte !== 'string') return { erreur: 'Une note n\'a pas de texte.' };
      if (brute.texte.length > LIMITES.texte) return { erreur: `Une note dépasse ${LIMITES.texte} caractères.` };
      const n = d.schema < 2 ? migrerNote(brute, d.schema) : { titre: titreDe(brute.texte), texte: nettoyer(brute.texte), creee: dateValide(brute.creee), maj: dateValide(brute.maj) };
      notes.push(n);
    }
    return { notes };
  }
  if (texte.length > LIMITES.texte) return { erreur: `Texte trop long pour une note (limite ${LIMITES.texte} caractères).` };
  return { notes: [{ titre: titreDe(texte), texte: nettoyer(texte), creee: maintenant(), maj: maintenant() }] };
}

function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a'); a.href = url; a.download = nom; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Vue ---
let compteurVues = 0;
const minuteries = new Set();
export function viderEnAttente() { minuteries.forEach((f) => f()); minuteries.clear(); }
addEventListener('pagehide', viderEnAttente);

export function monterNotes(racine) {
  if (racine.__notes) return racine.__notes;
  const k = ++compteurVues;
  const app = document.createElement('div'); app.className = 'notes__app';
  app.innerHTML = `
    <p class="notes__etat" role="status"></p>
    <div class="notes__colonnes">
      <div class="notes__gauche">
        <button type="button" class="tako-bouton notes__nouvelle">Nouvelle note</button>
        <ul class="notes__liste" aria-label="Mes notes"></ul>
      </div>
      <div class="notes__edition">
        <label class="notes__etiquette" for="note-texte-${k}">Texte de la note</label>
        <textarea id="note-texte-${k}" class="notes__texte" maxlength="${LIMITES.texte}" rows="9" spellcheck="true"></textarea>
        <p class="notes__compte"></p>
        <button type="button" class="tako-bouton notes__supprimer">Supprimer cette note</button>
      </div>
    </div>
    <div class="notes__outils" role="group" aria-label="Sauvegarde des notes">
      <button type="button" class="tako-bouton notes__export-json">Exporter (JSON)</button>
      <button type="button" class="tako-bouton notes__export-texte">Exporter (texte)</button>
      <label class="tako-bouton notes__import">Importer…<input type="file" class="notes__fichier" accept=".json,.txt,application/json,text/plain"></label>
      <button type="button" class="tako-bouton notes__effacer">Tout effacer…</button>
    </div>
    <div class="notes__confirmation" role="region" aria-label="Confirmation" hidden tabindex="-1"></div>`;
  racine.append(app);
  const $ = (s) => app.querySelector(s);
  const liste = $('.notes__liste'), zone = $('.notes__texte'), statut = $('.notes__etat'), compte = $('.notes__compte'), conf = $('.notes__confirmation');
  let courante = null, attente = null;

  const dire = (t) => { statut.textContent = t; };
  function rendre(e) {
    if (!courante || !e.notes.some((n) => n.id === courante)) courante = e.notes[0]?.id ?? null;
    liste.replaceChildren(...e.notes.map((n) => {
      const li = document.createElement('li'); const b = document.createElement('button');
      b.type = 'button'; b.className = 'notes__item'; b.dataset.id = n.id;
      const t = document.createElement('span'); t.textContent = n.titre;
      const d = document.createElement('small'); d.textContent = new Date(n.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      b.append(t, d); if (n.id === courante) b.setAttribute('aria-current', 'true');
      li.append(b); return li;
    }));
    const n = e.notes.find((x) => x.id === courante);
    zone.disabled = !n; $('.notes__supprimer').disabled = !n;
    if (document.activeElement !== zone || !n) zone.value = n ? n.texte : '';
    zone.placeholder = n ? '' : 'Aucune note. « Nouvelle note » pour commencer.';
    compte.textContent = n ? `${n.texte.length} / ${LIMITES.texte} caractères` : '';
    $('.notes__nouvelle').disabled = e.notes.length >= LIMITES.notes;
    app.dataset.statut = e.statut;
    const base = { chargement: 'Ouverture du bloc-notes…', pret: `${e.notes.length} note${e.notes.length > 1 ? 's' : ''}, enregistrée${e.notes.length > 1 ? 's' : ''} dans ce navigateur seulement.`,
      memoire: 'Stockage local indisponible (navigation privée ou refus du navigateur) : vos notes ne vivent que dans cet onglet. Exportez-les avant de fermer.',
      plein: 'Espace de stockage plein : la dernière modification n\'est pas enregistrée. Exportez vos notes, puis libérez de la place.' }[e.statut];
    if (!attente) dire(base + (e.migreDe && e.migreDe > 0 && e.statut === 'pret' ? ` Notes mises à jour depuis le format ${e.migreDe}.` : ''));
  }
  const desabonner = magasin.abonner(rendre);

  function enregistrer() { if (attente) { attente(); } }
  zone.addEventListener('input', () => {
    const id = courante, texte = zone.value;
    compte.textContent = `${texte.length} / ${LIMITES.texte} caractères`;
    // Écriture différée (300 ms) : une transaction par pause de frappe, pas par touche.
    if (attente) { clearTimeout(attente.t); minuteries.delete(attente); }
    const f = () => { clearTimeout(f.t); minuteries.delete(f); if (attente === f) attente = null; magasin.modifier(id, texte); };
    f.t = setTimeout(f, 300); attente = f; minuteries.add(f);
  });
  zone.addEventListener('blur', enregistrer);
  liste.addEventListener('click', (e) => { const b = e.target.closest('.notes__item'); if (!b) return; enregistrer(); courante = b.dataset.id; rendre(magasin.etat); zone.focus(); });
  $('.notes__nouvelle').addEventListener('click', () => { enregistrer(); const n = magasin.creer(); if (n) { courante = n.id; rendre(magasin.etat); zone.focus(); dire('Nouvelle note créée.'); } });

  function confirmer(contenu, actions) {
    conf.replaceChildren(...contenu);
    const barre = document.createElement('div'); barre.className = 'notes__actions';
    for (const [libelle, f, principal] of actions) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tako-bouton' + (principal ? ' tako-bouton--principal' : ''); b.textContent = libelle;
      b.addEventListener('click', () => { const ret = f(); if (ret !== false) fermerConf(); }); barre.append(b);
    }
    conf.append(barre); conf.hidden = false; conf.focus();
  }
  const fermerConf = () => { conf.hidden = true; conf.replaceChildren(); };
  const para = (t, cls) => { const p = document.createElement('p'); p.textContent = t; if (cls) p.className = cls; return p; };

  $('.notes__supprimer').addEventListener('click', () => {
    const n = magasin.etat.notes.find((x) => x.id === courante); if (!n) return;
    confirmer([para(`Supprimer « ${n.titre} » ? Cette action est définitive.`)], [['Supprimer', () => { magasin.supprimer(n.id); dire('Note supprimée.'); }, true], ['Annuler', () => {}]]);
  });
  $('.notes__effacer').addEventListener('click', () => {
    enregistrer();
    const nb = magasin.etat.notes.length;
    confirmer([para(`Effacer définitivement ${nb} note${nb > 1 ? 's' : ''} de ce navigateur ? Exportez-les d'abord si vous voulez les garder.`)],
      [['Exporter d\'abord (JSON)', () => { exporter('json'); return false; }], ['Oui, tout effacer', () => { magasin.toutEffacer(); dire('Bloc-notes remis à zéro.'); }, true], ['Annuler', () => {}]]);
  });
  function exporter(type) {
    enregistrer();
    const d = new Date().toISOString().slice(0, 10);
    if (type === 'json') telecharger(`majortakito-notes-${d}.json`, exporterJSON(magasin.etat.notes), 'application/json');
    else telecharger(`majortakito-notes-${d}.txt`, exporterTexte(magasin.etat.notes), 'text/plain;charset=utf-8');
    dire(`Export ${type === 'json' ? 'JSON' : 'texte'} prêt : ${magasin.etat.notes.length} note(s).`);
  }
  $('.notes__export-json').addEventListener('click', () => exporter('json'));
  $('.notes__export-texte').addEventListener('click', () => exporter('texte'));
  $('.notes__fichier').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > LIMITES.fichier) { dire(`Import refusé : fichier trop gros (limite ${LIMITES.fichier / 1024} Ko).`); return; }
    const r = analyserImport(f.name, await f.text());
    if (r.erreur) { dire('Import refusé : ' + r.erreur); return; }
    // Aperçu avant écriture : nombre, titres et début du texte, en texte brut uniquement.
    const ul = document.createElement('ul'); ul.className = 'notes__apercu-liste';
    r.notes.slice(0, 5).forEach((n) => { const li = document.createElement('li'); li.textContent = n.titre; ul.append(li); });
    const extrait = document.createElement('pre'); extrait.className = 'notes__apercu'; extrait.textContent = r.notes[0].texte.slice(0, 280) + (r.notes[0].texte.length > 280 ? '…' : '');
    const total = magasin.etat.notes.length + r.notes.length;
    const actions = [];
    if (total <= LIMITES.notes) actions.push(['Ajouter à mes notes', () => { magasin.importer(r.notes, 'ajouter'); dire(`${r.notes.length} note(s) importée(s).`); }, true]);
    actions.push(['Remplacer toutes mes notes', () => { magasin.importer(r.notes, 'remplacer'); dire(`Notes remplacées par ${r.notes.length} note(s) importée(s).`); }], ['Annuler', () => dire('Import annulé.')]);
    confirmer([para(`Fichier « ${f.name.slice(0, 80)} » : ${r.notes.length} note(s).${total > LIMITES.notes ? ` L'ajout dépasserait ${LIMITES.notes} notes : seul le remplacement est possible.` : ''}`), ul, extrait], actions);
  });
  demarrer();
  racine.__notes = { detruire: desabonner };
  return racine.__notes;
}
