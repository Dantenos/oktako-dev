// Le descripteur de la prochaine cuisson active seul TakoSound : l'ancienne radio reste intacte.
// Le lecteur reste maître de la playlist ; ce module ne crée ni son, ni requête, ni horloge parallèle.
export function creerRadioTakosound({ THREE, groupes, contrat }) {
  if (!contrat) return null;
  const principal = groupes.radio, station = groupes[contrat.station.objet];
  const verres = groupes[contrat.verre];
  const filaments = Object.entries(contrat.emissions).map(([id, couleur]) => ({ id, couleur, groupe: groupes[id] }));
  if (contrat.version !== 1 || !principal || !station || !verres || filaments.some(f => !f.groupe)) throw Error('TakoSound : export incomplet');
  principal.attach(verres); delete groupes[contrat.verre];
  // Une vitre cuite opaque masquerait les filaments vivants. Sa patine reste transparente et ne bouche pas la profondeur.
  verres.traverse(m => { if (m.isMesh) { m.material.transparent=true;
    m.material.opacity=.16; m.material.depthWrite=false; m.renderOrder=2; } });
  const pivot = new THREE.Group(); pivot.name = 'TS_station'; pivot.position.fromArray(contrat.station.point);
  principal.add(pivot); principal.updateMatrixWorld(true); pivot.attach(station);
  delete groupes[contrat.station.objet];
  const axe = new THREE.Vector3().fromArray(contrat.station.axe).normalize();
  const lueurs = [];
  for (const { id, couleur, groupe } of filaments) {
    groupe.name=id;
    principal.attach(groupe); delete groupes[id];
    // La matière cuite reste dessous : au silence, aucune lumière résiduelle dans l'atlas.
    const originaux = []; groupe.traverse(m => { if (m.isMesh) originaux.push(m); });
    for (const m of originaux) {
      const lueur = m.clone(false);
      const base = new THREE.Color(couleur);
      lueur.material = new THREE.MeshBasicMaterial({ color: base, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      lueur.visible=false; m.parent.add(lueur); lueurs.push({ lueur, base });
    }
  }
  principal.traverse(m => { if (m.isMesh) m.userData.objet = 'radio'; });
  let courante = '', crans = 0, force = 0, audible = false;
  return {
    // À appeler aussi lors d'une transition automatique, d'une pause, du film ou d'un onglet caché.
    observer({ lecture = false, station: id = '', film = false, visible = true } = {}) {
      if (lecture && id) {
        if (courante && id !== courante) crans++;
        courante=id;
      }
      audible=!!(lecture && !film && visible);
      // Éteindre immédiatement, même quand la boucle de scène vient de se suspendre.
      if (!audible) { force=0; for(const {lueur} of lueurs) lueur.visible=false; }
      pivot.quaternion.setFromAxisAngle(axe, crans * contrat.station.cran);
    },
    image(secondes, mouvementReduit = false) {
      force=audible ? 2 * (1 + (mouvementReduit ? 0 : .08 * Math.sin(2 * Math.PI * secondes / 3))) : 0;
      for (const {lueur, base} of lueurs) {
        lueur.visible=force>0; lueur.material.color.copy(base).multiplyScalar(force);
      }
    },
    etat: () => ({ station: courante, crans, angle: crans * contrat.station.cran, force }),
  };
}
